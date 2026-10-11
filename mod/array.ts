import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeBox,
  qbeSegment,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

class ArrayOf implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ArrayOf.#checkCell(cell)

    const xs = cell.expr.car.slice(1).toReversed()
    for (const x of xs) {
      ctx.compileExpr(x, env)
    }

    ctx.compileExpr(
      { expr: { type: 'num', value: xs.length }, meta: cell.meta },
      env,
    )
    ctx.compileExpr(
      { expr: { type: 'str', value: 'array-new' }, meta: cell.meta },
      env,
    )
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    ArrayOf.#checkCell(cell)
    const xs = ctx.compileArgs(cell, env)

    const arr = ctx.defineTemp(`alloc8 ${16 + xs.length * 8}`, env)
    const p = ctx.defineTemp(`copy ${arr}`, env)
    // arr.type = .arr
    ctx.emit(`storeh ${qbeBox.arr}, ${p}`)
    // arr.segment = .stack
    ctx.emit(`${p} =l add ${p}, 2`)
    ctx.emit(`storeh ${qbeSegment.stack}, ${p}`)
    // arr.id = 0
    ctx.emit(`${p} =l add ${p}, 2`)
    ctx.emit(`storew 0, ${p}`)
    // arr.len = xs.len
    ctx.emit(`${p} =l add ${p}, 4`)
    ctx.emit(`storel ${xs.length}, ${p}`)
    // arr.data <- xs
    for (const x of xs) {
      // arr.data[i] = x
      ctx.emit(`${p} =l add ${p}, ${8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }
    return arr
  }

  static #checkCell({ expr, meta }: ASTNode<SExprCell>) {
    if (expr.cdr !== null) {
      error(meta, 'compiling: unexpected `cdr`')
    }
  }
}

export default {
  name: 'array',
  dependencies: [],
  units: { array: ArrayOf },
  prelude: '',
} satisfies Module
