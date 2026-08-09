import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import type { ASTNode, BytecodeCompiler, QBECompiler, SExprCell } from '@/type'
import type { Module } from '.'

class ArrayOf implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const xs = cell.expr.car.slice(1).toReversed()
    for (const x of xs) {
      ctx.compileExpr(x, env)
    }
    ctx.emit(Instruction.ArrayNew(xs.length))
  }

  /**
   * - array: 0
   * - struct: 1
   * - array (managed): 0 | (1 << 63) = 0x8000000000000000
   * - struct (managed): 1 | (1 << 63) = 0x8000000000000001
   */
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const xs = ctx.compileArgs(cell, env)
    const arr = env.defineTemp()
    ctx.emit(`${arr} =l alloc8 ${xs.length * 8}`)

    const p = env.defineTemp()
    for (const [i, x] of xs.entries()) {
      // arr[i] = x
      ctx.emit(`${p} =l add ${arr}, ${i * 8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }

    // let header = { type: u64; len: u64; ptr: u64 }
    const header = env.defineTemp()
    ctx.emit(`${header} =l alloc8 24`)
    // header.type = 0
    ctx.emit(`storel 0, ${header}`)
    // header.len = xs.len
    ctx.emit(`${p} =l add ${header}, 8`)
    ctx.emit(`storel ${xs.length}, ${p}`)
    // header.ptr = arr
    ctx.emit(`${p} =l add ${header}, 16`)
    ctx.emit(`storel ${arr}, ${p}`)

    return ctx.wrapArray(header, env)
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
  }
}

QBEBackend.prototype.wrapArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l or ${x}, ${0b011}`)
  return result
}

QBEBackend.prototype.unwrapArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l and ${x}, ${~0b111}`)
  return result
}
