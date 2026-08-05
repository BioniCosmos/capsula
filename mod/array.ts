import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE } from '@/env'
import type { ASTNode, BytecodeCompiler, QBECompiler, SExprCell } from '@/type'
import type { Module } from '.'

class ArrayOf implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
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
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
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

class DebugArray implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.DebugArray)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const arr = ctx.unwrapArray(ctx.compileExpr(cell.expr.car[1], env)!, env)

    const headFormat = ctx.env.defineVar('debug_array_head_format')
    ctx.emitGlobal(`data ${headFormat} = { b "[%lld]: [", b 0 }`)
    const firstFormat = ctx.env.defineVar('debug_array_first_format')
    ctx.emitGlobal(`data ${firstFormat} = { b "%lld", b 0 }`)
    const elementFormat = ctx.env.defineVar('debug_array_element_format')
    ctx.emitGlobal(`data ${elementFormat} = { b " %lld", b 0 }`)
    const tail = ctx.env.defineVar('debug_array_tail')
    ctx.emitGlobal(`data ${tail} = { b "]", b 0 }`)

    // let len = arr.len
    const p = env.defineTemp()
    ctx.emit(`${p} =l add ${arr}, 8`)
    const len = env.defineTemp()
    ctx.emit(`${len} =l loadl ${p}`)

    // printf(head_format, len)
    ctx.emit(`call $printf(l ${headFormat}, ..., l ${len})`)

    // let ptr = arr.ptr
    ctx.emit(`${p} =l add ${arr}, 16`)
    const ptr = env.defineTemp()
    ctx.emit(`${ptr} =l loadl ${p}`)

    // printf(first_format, ptr[0])
    const x = env.defineTemp()
    ctx.emit(`${x} =l loadl ${ptr}`)
    ctx.emit(`call $printf(l ${firstFormat}, ..., l ${ctx.unwrapI64(x, env)})`)

    // for
    const loopTest = env.defineBlock()
    const loopBody = env.defineBlock()
    const loopEnd = env.defineBlock()
    // let i = 1
    const i = env.defineTemp()
    ctx.emit(`${i} =l copy 1`)
    // i < len
    ctx.emit(loopTest)
    const hasNext = env.defineTemp()
    ctx.emit(`${hasNext} =l csltl ${i}, ${len}`)
    ctx.emit(`jnz ${hasNext}, ${loopBody}, ${loopEnd}`)

    ctx.emit(loopBody)
    // printf(element_format, ptr[i])
    ctx.emit(`${p} =l mul ${i}, 8`)
    ctx.emit(`${p} =l add ${ptr}, ${p}`)
    ctx.emit(`${x} =l loadl ${p}`)
    ctx.emit(
      `call $printf(l ${elementFormat}, ..., l ${ctx.unwrapI64(x, env)})`,
    )

    // i++
    ctx.emit(`${i} =l add ${i}, 1`)
    ctx.emit(`jmp ${loopTest}`)

    ctx.emit(loopEnd)
    // puts(tail)
    ctx.emit(`call $puts(l ${tail})`)
    return null
  }
}

export default {
  name: 'array',
  dependencies: [],
  units: { array: ArrayOf, 'debug-array': DebugArray },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    wrapArray(x: string, env: QBE.Env): string
    unwrapArray(x: string, env: QBE.Env): string
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
