import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  num,
  qbeBox,
  qbeSegment,
  str,
  type ArgumentChecker,
  type ASTNode,
  type BytecodeCompiler,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import type { Module } from '.'

class Array implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const xs = cell.expr.car.slice(1).toReversed()
    for (const x of xs) {
      ctx.compileExpr(x, env)
    }

    ctx.compileExpr(
      { expr: { type: 'num', value: xs.length }, meta: cell.meta },
      env,
    )
    ctx.compileExpr(num(0, cell.meta), env)
    ctx.compileExpr(
      { expr: { type: 'str', value: 'array-new' }, meta: cell.meta },
      env,
    )
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
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

  checkRule: CheckRule = {}
}

class ArrayLen implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(
    ctx: BytecodeBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ) {
    ctx.compileExpr(expr.car[1], env)
    ctx.compileExpr(str('array-len', meta), env)
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const arr = ctx.compileExpr(cell.expr.car[1], env)
    return ctx.wrapI64(
      ctx.defineTemp(`loadl ${ctx.defineTemp(`add ${arr}, 8`, env)}`, env),
      env,
    )
  }

  checkRule: CheckRule = { car: ['arr'] }
}

class ArrayAt implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(
    ctx: BytecodeBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ) {
    const { car } = expr
    ctx.compileExpr(car[2], env)
    ctx.compileExpr(car[1], env)
    ctx.compileExpr(str('array-at', meta), env)
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [arr, i] = ctx.compileArgs(cell, env)
    const offset = ctx.defineTemp(`mul ${ctx.unwrapI64(i, env)}, 8`, env)
    const addr = ctx.defineTemp(
      `add ${ctx.defineTemp(`add ${arr}, 16`, env)}, ${offset}`,
      env,
    )
    return ctx.defineTemp(`loadl ${addr}`, env)
  }

  checkRule: CheckRule = { car: ['arr', 'i64'] }
}

export default {
  name: 'array',
  dependencies: [],
  units: { array: Array, 'array-len': ArrayLen, 'array-at': ArrayAt },
  prelude: '',
} satisfies Module
