import type { Register } from 'claude-code'

// MakeItCount kulcs-őr: a 3. alkalom kulcs-szabályai, gépi őrrel.
// 1. A .env (és .env.valami) fájlt a Claude nem olvashatja, nem írhatja ki, nem küldheti fel.
//    A .env.minta / .env.example kivétel, abban nincs valódi kulcs.
// 2. Ha a promptban kulcsnak látszó szöveg van, a prompt el sem indul.
// Mac, Linux és Windows: / és \ elválasztó, bármilyen kis- és nagybetű (a Mac és a Windows
// fájlrendszere alapból nem különbözteti meg őket), Bash, PowerShell és Grep eszköz.

// The .env file name inside a path or a command. It follows a separator (/ or \), a quote, a space,
// =, :, ( or a comma, and ends the word. Case-insensitive: .ENV opens the same file on macOS and Windows.
const ENV_FILE = /(^|[\s/\\'"=:(,])\.env(\.(?!minta\b|example\b|sample\b)[\w.-]+)?(?=$|[\s'"`;|&<>),\]}])/i
// The same name inside a glob (.env, .env*, **/.env, *.env, {.env,x}).
const ENV_GLOB = /(^|[\s/\\{,*])\.env(?!\.(minta|example|sample)\b)(?![\w-])/i

const KEY_PATTERNS: [RegExp, string][] = [
  [/\bsk-(ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/, 'API-kulcs (sk-...)'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub-token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS-kulcs'],
  [/\bxox[abpr]-[A-Za-z0-9-]{20,}/, 'Slack-token'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b.*\b(key|kulcs|api)\b|\b(key|kulcs|api)\b.*\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'kulcsnak látszó azonosító'],
  [/\b(api[_ -]?key|secret|token|kulcs)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-]{24,}/i, 'kulcs = érték'],
]

// Bash: commands that read, copy, send or load a file when they come first in a command segment.
// powershell, pwsh and cmd are here too: from Git Bash on Windows they can read the file themselves.
const READERS = /^(sudo\s+)?(cat|less|more|head|tail|grep|egrep|fgrep|rg|awk|sed|nl|od|tac|bat|cp|mv|scp|rsync|curl|wget|open|base64|xxd|strings|source|\.|export|python3?\s+-c|node\s+-e|ruby\s+-e|perl\s+-e|powershell(\.exe)?|pwsh(\.exe)?|cmd(\.exe)?)\b/i

// PowerShell: cmdlets and aliases that read, copy or send a file, at the start of a segment.
const PS_READERS = /^(&\s*)?(Get-Content|gc|cat|type|Select-String|sls|Copy-Item|cpi|copy|cp|Move-Item|mi|move|mv|Rename-Item|rni|ren|more|Format-Hex|fhx|Import-Csv|ipcsv|ConvertFrom-StringData|Import-PowerShellDataFile|Invoke-WebRequest|iwr|Invoke-RestMethod|irm|curl|wget|Start-BitsTransfer|Compress-Archive|Send-MailMessage|findstr|certutil|scp|bash|wsl|cmd|python3?\s+-c|py\s+-c|node\s+-e)\b/i
// PowerShell: reading a file through .NET, anywhere in the command.
const PS_DOTNET_READ = /\[(System\.)?IO\.(File|StreamReader|FileStream)\]::|New-Object\s+(System\.)?IO\.(StreamReader|FileStream)|\bReadAll(Text|Lines|Bytes)\b/i
// PowerShell: listing every environment variable (the counterpart of printenv).
const PS_ENV_LIST = /^(Get-ChildItem|gci|dir|ls|Get-Item|gi)\s+(-Path\s+)?env:\\?\*?\s*$/i
const PS_DOTNET_ENV = /\[(System\.)?Environment\]::GetEnvironmentVariables/i

const GIT_ADD = /^git\s+add\b/i
const GIT_ADD_FORCE = /^git\s+add\s+(.*\s)?(-f|--force)\b/i

const deny = (why: string) => ({
  deny: `Kulcs-őr: ${why} A kulcsot csak te írod be a .env fájlba, a Claude nem látja.`,
})
const failed = () => deny('az ellenőrzés hibára futott, ezért biztonságból megállítottam.')

const hasEnvFile = (text: string) => ENV_FILE.test(' ' + text)

// Heredoc bodies are text being written, not commands: drop them before judging.
const dropHeredocs = (cmd: string) => cmd.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\s|$)/g, ' ')

const gitAddProblem = (seg: string) =>
  GIT_ADD.test(seg) && (hasEnvFile(seg) || GIT_ADD_FORCE.test(seg))
    ? 'a .env nem kerülhet a GitHubra, és erőltetett hozzáadást (-f) sem engedek.'
    : undefined

function judgeBash(command: string): string | undefined {
  const segments = dropHeredocs(command).split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const git = gitAddProblem(seg)
    if (git) return git
    if (hasEnvFile(seg) && READERS.test(seg)) return 'ez a parancs a .env tartalmát olvasná vagy vinné el.'
    if (/^(printenv|env)$/.test(seg)) return 'a környezeti változók kiírása kulcsot fedhet fel.'
  }
  return undefined
}

function judgePowerShell(command: string): string | undefined {
  // A segment also starts after ( { and = so that $k = Get-Content .env and (gc .env) count.
  const segments = command.split(/&&|\|\||[;|\n\r({=]/).map(s => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const git = gitAddProblem(seg)
    if (git) return git
    if (PS_ENV_LIST.test(seg)) return 'a környezeti változók kiírása kulcsot fedhet fel.'
  }
  if (PS_DOTNET_ENV.test(command)) return 'a környezeti változók kiírása kulcsot fedhet fel.'
  // Judged on the whole command: in Get-Item .env | Get-Content the reader has no .env of its own.
  if (hasEnvFile(command) && (segments.some(s => PS_READERS.test(s)) || PS_DOTNET_READ.test(command)))
    return 'ez a parancs a .env tartalmát olvasná vagy vinné el.'
  return undefined
}

function judgeGrep(path: unknown, glob: unknown): string | undefined {
  if (typeof path === 'string' && hasEnvFile(path)) return `a ${path} fájl védett.`
  if (typeof glob === 'string' && ENV_GLOB.test(glob)) return 'a .env fájlban nem kereshetek.'
  return undefined
}

export const register: Register = on => {
  for (const tool of ['Read', 'Edit', 'Write'] as const) {
    on('tool.call', { tool }, ($, e, next) =>
      hasEnvFile(e.file_path) ? deny(`a ${e.file_path} fájl védett.`) : next(e),
    ).catch(($, e, next) => (next.called ? next(e) : failed()))
  }

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const why = judgeBash(e.command)
    return why ? deny(why) : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : failed()))

  // PowerShell (Windows) and Grep are not in every build's tool list, so they are matched by name here.
  const OTHER_GUARDED = ['PowerShell', 'Grep']
  on('tool.call', ($, e, next) => {
    const call = e as unknown as { tool: string; command?: unknown; path?: unknown; glob?: unknown }
    if (call.tool === 'PowerShell') {
      const why = judgePowerShell(typeof call.command === 'string' ? call.command : '')
      return why ? deny(why) : next(e)
    }
    if (call.tool === 'Grep') {
      const why = judgeGrep(call.path, call.glob)
      return why ? deny(why) : next(e)
    }
    return next(e)
  }).catch(($, e, next) =>
    next.called || !OTHER_GUARDED.includes(String((e as { tool?: unknown }).tool)) ? next(e) : failed(),
  )

  on('prompt.submit', ($, e, next) => {
    const hit = KEY_PATTERNS.find(([re]) => re.test(e.text))
    if (hit) {
      $.ui.toast('Kulcs-őr: a prompt nem ment el.')
      return { drop: `Kulcs-őr: a promptodban ${hit[1]} látszik, ezért nem küldtem el. Kulcsot soha ne írj a chatbe: a .env fájlba írd, saját kezűleg. Ha ez tévedés, fogalmazd át a kulcs nélkül.` }
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
