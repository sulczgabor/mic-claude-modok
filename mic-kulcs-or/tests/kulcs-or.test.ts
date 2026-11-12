import { describe, expect, test } from 'claude-code/testing'

// Each test hook below stands for the engine: when the kulcs-őr lets a call
// through, it lands here and counts as "reached".
type Call = Record<string, unknown> & { tool: string }

async function reaches($: any, on: any, call: Call): Promise<boolean> {
  let reached = false
  on('tool.call', () => {
    reached = true
    return { result: {} }
  })
  await $.tool.call(call as never)
  return reached
}

const BLOCKED: [string, Call][] = [
  // Read / Edit / Write: macOS and Windows paths, any letter case
  ['Read, macOS path', { tool: 'Read', file_path: '/Users/x/Befektetes/.env' }],
  ['Read, Windows path', { tool: 'Read', file_path: 'C:\\Users\\x\\Befektetes\\.env' }],
  ['Read, Windows .env.local', { tool: 'Read', file_path: 'C:\\Users\\x\\Befektetes\\.env.local' }],
  ['Read, upper case', { tool: 'Read', file_path: '/Users/x/Befektetes/.ENV' }],
  ['Edit, Windows path', { tool: 'Edit', file_path: 'C:\\Users\\x\\Befektetes\\.env', old_string: 'a', new_string: 'b' }],
  ['Write, Windows path', { tool: 'Write', file_path: 'C:\\Users\\x\\Befektetes\\.env', content: 'X=1' }],
  // Bash (also Git Bash on Windows)
  ['Bash cat', { tool: 'Bash', command: 'cat .env' }],
  ['Bash cat, Windows path', { tool: 'Bash', command: 'cat C:\\Users\\x\\Befektetes\\.env' }],
  ['Bash calling PowerShell', { tool: 'Bash', command: 'powershell -c "Get-Content .env"' }],
  ['Bash calling pwsh', { tool: 'Bash', command: 'pwsh -Command Get-Content ./.env' }],
  ['Bash calling cmd', { tool: 'Bash', command: 'cmd /c type .env' }],
  ['Bash git add', { tool: 'Bash', command: 'git add .env' }],
  ['Bash env listing', { tool: 'Bash', command: 'printenv' }],
  // PowerShell tool (Windows)
  ['PS Get-Content', { tool: 'PowerShell', command: 'Get-Content .env' }],
  ['PS Get-Content -Raw, full path', { tool: 'PowerShell', command: 'Get-Content -Raw C:\\Users\\x\\Befektetes\\.env' }],
  ['PS gc alias', { tool: 'PowerShell', command: 'gc .\\.env' }],
  ['PS type alias', { tool: 'PowerShell', command: 'type .env' }],
  ['PS cat alias', { tool: 'PowerShell', command: 'cat .env' }],
  ['PS assignment', { tool: 'PowerShell', command: '$k = Get-Content .env; $k' }],
  ['PS pipeline', { tool: 'PowerShell', command: 'Get-Item .env | Get-Content' }],
  ['PS .NET read', { tool: 'PowerShell', command: '[System.IO.File]::ReadAllText(".env")' }],
  ['PS Select-String', { tool: 'PowerShell', command: 'Select-String -Path .env -Pattern KEY' }],
  ['PS Copy-Item', { tool: 'PowerShell', command: 'Copy-Item .env C:\\temp\\x.txt' }],
  ['PS parameter colon', { tool: 'PowerShell', command: 'Get-Content -Path:.env' }],
  ['PS upper case', { tool: 'PowerShell', command: 'Get-Content .ENV' }],
  ['PS env listing', { tool: 'PowerShell', command: 'Get-ChildItem Env:' }],
  ['PS env listing, dir', { tool: 'PowerShell', command: 'dir env:' }],
  ['PS .NET env listing', { tool: 'PowerShell', command: '[Environment]::GetEnvironmentVariables()' }],
  ['PS git add', { tool: 'PowerShell', command: 'git add .env' }],
  ['PS git add -f', { tool: 'PowerShell', command: 'git add -f titok.txt' }],
  // Grep returns file contents
  ['Grep on .env, Windows path', { tool: 'Grep', pattern: 'KEY', path: 'C:\\Users\\x\\Befektetes\\.env' }],
  ['Grep on .env, macOS path', { tool: 'Grep', pattern: 'KEY', path: '/Users/x/Befektetes/.env' }],
  ['Grep with .env glob', { tool: 'Grep', pattern: 'KEY', glob: '.env' }],
  ['Grep with .env* glob', { tool: 'Grep', pattern: 'KEY', glob: '.env*' }],
]

const ALLOWED: [string, Call][] = [
  ['Read .env.minta, Windows', { tool: 'Read', file_path: 'C:\\Users\\x\\Befektetes\\.env.minta' }],
  ['Read .env.example', { tool: 'Read', file_path: '/Users/x/Befektetes/.env.example' }],
  ['Read environment.md', { tool: 'Read', file_path: 'C:\\Users\\x\\Befektetes\\environment.md' }],
  ['Read CLAUDE.md, Windows', { tool: 'Read', file_path: 'C:\\Users\\x\\Befektetes\\CLAUDE.md' }],
  ['Bash ls', { tool: 'Bash', command: 'ls -la' }],
  ['Bash cat .env.minta', { tool: 'Bash', command: 'cat .env.minta' }],
  ['Bash python skill', { tool: 'Bash', command: 'python3 hangulat_index.py --download' }],
  ['PS Test-Path', { tool: 'PowerShell', command: 'Test-Path .env' }],
  ['PS Get-Content .env.minta', { tool: 'PowerShell', command: 'Get-Content .env.minta' }],
  ['PS Get-ChildItem', { tool: 'PowerShell', command: 'Get-ChildItem -Force' }],
  ['PS python skill', { tool: 'PowerShell', command: 'python hangulat_index.py --data adat --out index.json --download' }],
  ['PS Get-Content other file', { tool: 'PowerShell', command: 'Get-Content README.md' }],
  ['PS git add other file', { tool: 'PowerShell', command: 'git add README.md' }],
  ['Grep in folder', { tool: 'Grep', pattern: 'KEY', path: 'C:\\Users\\x\\Befektetes' }],
  ['Grep with md glob', { tool: 'Grep', pattern: 'KEY', glob: '*.md' }],
  ['Glob for .env', { tool: 'Glob', pattern: '.env*' }],
]

describe('kulcs-őr: ezt megállítja', () => {
  for (const [name, call] of BLOCKED) {
    test(name, async ($, on) => {
      expect(await reaches($, on, call)).toBe(false)
    })
  }
})

describe('kulcs-őr: ezt átengedi', () => {
  for (const [name, call] of ALLOWED) {
    test(name, async ($, on) => {
      expect(await reaches($, on, call)).toBe(true)
    })
  }
})
