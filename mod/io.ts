import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import { CallSite, type Params, qbeConst, str, Unit } from '@/type'
import type { Module } from '.'

class Print extends Unit {
  override params: Params = { car: ['any'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[0]))
    ctx.compileExpr(str('print'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, _env: QBEEnv, _site: CallSite, args: string[]) {
    ctx.emit(`call $var_display(l ${args[0]})`)
    return qbeConst.Unit
  }
}

export default {
  name: 'IO',
  dependencies: [],
  units: { print: Print },
  prelude: '',
} satisfies Module
