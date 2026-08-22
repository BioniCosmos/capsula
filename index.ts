import { BytecodeBackend, QBEBackend, type Backend } from '@/backend'
import { exit } from 'node:process'
import { parseArgs } from 'node:util'
import { init } from './mod'
import { parse } from './parser'
import type { Unit } from './type'

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: { backend: { type: 'string' } },
  allowPositionals: true,
})

let backendOption = import.meta.env.BACKEND ?? ''
if (values.backend) {
  backendOption = values.backend
}

let fileName: string
let source: string

if (positionals.length >= 3) {
  fileName = positionals[2]
  source = await Bun.file(fileName).text()
} else if (Bun.stdin.size !== Infinity) {
  fileName = '-'
  source = await Bun.stdin.text()
} else {
  console.log(`capsula [options...] <file>

options:
  --backend <backend>  specifies a compiler backend. available backends: \`bytecode\`, \`qbe\``)
  exit(1)
}

let backend: Backend<Unit, unknown>
switch (backendOption) {
  case 'bytecode':
    backend = new BytecodeBackend()
    break
  case 'qbe':
    backend = new QBEBackend()
    break
  case '':
    console.error(
      'capsula: requires a backend. Use `--backend` or `BACKEND=` to specify a backend (`bytecode` or `qbe`).',
    )
    exit(1)
  default:
    console.error(
      'capsula: unsupported backend. available backends: `bytecode`, `qbe`',
    )
    exit(1)
}
await init(backend)
await backend.compile(parse(source, fileName))
