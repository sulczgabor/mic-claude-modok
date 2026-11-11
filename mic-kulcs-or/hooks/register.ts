import type { Register } from 'claude-code'

// MakeItCount kulcs-őr: a 3. alkalom kulcs-szabályai, gépi őrrel.
// 1. A .env (és .env.valami) fájlt a Claude nem olvashatja, nem írhatja ki, nem küldheti fel.
//    A .env.minta / .env.example kivétel, abban nincs valódi kulcs.
// 2. Ha a promptban kulcsnak látszó szöveg van, a prompt el sem indul.

const ENV_FILE = /(^|[\s/'"=])\.env(\.(?!minta\b|example\b|sample\b)[\w.-]+)?(?=$|[\s'";|&>)])/
const KEY_PATTERNS: [RegExp, string][] = [
  [/\bsk-(ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/, 'API-kulcs (sk-...)'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub-token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS-kulcs'],
  [/\bxox[abpr]-[A-Za-z0-9-]{20,}/, 'Slack-token'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b.*\b(key|kulcs|api)\b|\b(key|kulcs|api)\b.*\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'kulcsnak látszó azonosító'],
  [/\b(api[_ -]?key|secret|token|kulcs)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-]{24,}/i, 'kulcs = érték'],
]

// Commands that read, copy, send or load a file when they come first in a command segment.
const READERS = /^(sudo\s+)?(cat|less|more|head|tail|grep|egrep|fgrep|rg|awk|sed|nl|od|tac|bat|cp|mv|scp|rsync|curl|wget|open|base64|xxd|strings|source|\.|export|python3?\s+-c|node\s+-e|ruby\s+-e|perl\s+-e)\b/

const deny = (why: string) => ({
  deny: `Kulcs-őr: ${why} A kulcsot csak te írod be a .env fájlba, a Claude nem látja.`,
})

export const register: Register = on => {
  for (const tool of ['Read', 'Edit', 'Write'] as const) {
    on('tool.call', { tool }, ($, e, next) =>
      ENV_FILE.test(' ' + e.file_path) ? deny(`a ${e.file_path} fájl védett.`) : next(e),
    ).catch(($, e, next) => (next.called ? next(e) : deny('az ellenőrzés hibára futott, ezért biztonságból megállítottam.')))
  }

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    // Heredoc bodies are text being written, not commands: drop them before judging.
    const cmd = e.command.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\s|$)/g, ' ')
    const segments = cmd.split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(Boolean)
    for (const seg of segments) {
      if (/^git\s+add\b/.test(seg) && (ENV_FILE.test(' ' + seg) || /^git\s+add\s+(.*\s)?(-f|--force)\b/.test(seg)))
        return deny('a .env nem kerülhet a GitHubra, és erőltetett hozzáadást (-f) sem engedek.')
      if (ENV_FILE.test(' ' + seg) && READERS.test(seg))
        return deny('ez a parancs a .env tartalmát olvasná vagy vinné el.')
      if (/^(printenv|env)$/.test(seg)) return deny('a környezeti változók kiírása kulcsot fedhet fel.')
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : deny('az ellenőrzés hibára futott, ezért biztonságból megállítottam.')))

  on('prompt.submit', ($, e, next) => {
    const hit = KEY_PATTERNS.find(([re]) => re.test(e.text))
    if (hit) {
      $.ui.toast('Kulcs-őr: a prompt nem ment el.')
      return { drop: `Kulcs-őr: a promptodban ${hit[1]} látszik, ezért nem küldtem el. Kulcsot soha ne írj a chatbe: a .env fájlba írd, saját kezűleg. Ha ez tévedés, fogalmazd át a kulcs nélkül.` }
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
