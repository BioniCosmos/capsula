import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE } from '@/env'
import {
  qbeUnit,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import type { Module } from '.'

class Print implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Print)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const value = ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(`call $print_var(l ${value})`)
    return qbeUnit
  }
}

export default {
  name: 'IO',
  dependencies: [],
  units: { print: Print },
  prelude: '',
} satisfies Module
