import { BytecodeBackend, QBEBackend, type Backend } from '@/backend'
import { exit } from 'node:process'
import { parseArgs } from 'node:util'
import { init } from './mod'
import { parse } from './parser'
import type { Unit } from './type'

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    backend: { type: 'string' },
    eval: { type: 'string' },
    output: { type: 'string' },
  },
  allowPositionals: true,
})

const run = positionals.length >= 3 && positionals[2] === 'run'

let backendOption = import.meta.env.BACKEND ?? ''
if (values.backend) {
  backendOption = values.backend
}

const output = run
  ? `/tmp/${Math.random().toString(16).slice(2, 8)}`
  : values.output

let fileName: string
let source: string

if (positionals.length >= (run ? 4 : 3)) {
  fileName = positionals[run ? 3 : 2]
  source = await Bun.file(fileName).text()
} else if (values.eval) {
  fileName = '-'
  source = values.eval
} else if (Bun.stdin.size !== Infinity) {
  fileName = '-'
  source = await Bun.stdin.text()
} else {
  console.log(`capsula [options...] [run] <file>

options:
  --backend <backend>  specifies a compiler backend. available backends: \`bytecode\`, \`qbe\`
  --eval <source>      uses a string as source code instead of reading from file
  --output <file>      the output file path`)
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
await backend.compile(parse(source, fileName), output)

if (run) {
  await backend.run(output!)
  await Bun.file(output!).delete()
}
