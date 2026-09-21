import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
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

  /**
   * - array: 0
   * - struct: 1
   * - string: 2
   * - array (managed): 0 | (1 << 63) = 0x8000000000000000
   * - struct (managed): 1 | (1 << 63) = 0x8000000000000001
   */
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    ArrayOf.#checkCell(cell)

    const xs = ctx.compileArgs(cell, env)
    // arr := { type: u64; len: u64; data: ... }
    const arr = ctx.defineTemp(`alloc8 ${16 + xs.length * 8}`, env)
    const p = ctx.defineTemp(`copy ${arr}`, env)
    // arr.type = 0
    ctx.emit(`storel 0, ${p}`)
    // arr.len = xs.len
    ctx.emit(`${p} =l add ${p}, 8`)
    ctx.emit(`storel ${xs.length}, ${p}`)
    // arr.data <- xs
    for (const x of xs) {
      // arr.data[i] = x
      ctx.emit(`${p} =l add ${p}, ${8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }

    return ctx.wrapArray(arr, env)
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

declare module '@/backend' {
  interface QBEBackend {
    wrapArray(x: string, env: QBEEnv): string
    unwrapArray(x: string, env: QBEEnv): string
    arrayLen(x: string, env: QBEEnv): string
    isArray(x: string, env: QBEEnv): string
  }
}

QBEBackend.prototype.wrapArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l or ${x}, ${qbeConst.array}`)
  return result
}

QBEBackend.prototype.unwrapArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l and ${x}, ${~0b111}`)
  return result
}

QBEBackend.prototype.arrayLen = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l add ${this.unwrapArray(x, env)}, 8`)
  this.emit(`${result} =l loadl ${result}`)
  return result
}

QBEBackend.prototype.isArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l ceql ${this.tag(x, env)}, ${qbeConst.array}`)
  return result
}
