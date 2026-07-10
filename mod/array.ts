import {
  QBEBackend,
  type BytecodeBackend,
  type TreeWalkBackend,
} from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { iter, type List } from '@/list'
import { car } from '@/pair'
import type {
  Box,
  BytecodeCompiler,
  QBECompiler,
  SExpr,
  TreeWalkEvaluator,
  Var,
} from '@/type'
import type { Module } from '.'

class VarArray implements Box {
  type = 'array'

  constructor(public value: Var[]) {}
}

class ArrayOf implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const xs = Array.of<Var>()
    for (const expr of iter(exprs)) {
      xs.push(await ctx.evaluate(expr as SExpr, env))
    }
    return new VarArray(xs)
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const xs = iter(exprs).toArray().toReversed()
    for (const x of xs) {
      ctx.compileExpr(x as SExpr, env)
    }
    ctx.emit(Instruction.ArrayNew(xs.length))
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const xs = iter(exprs)
      .map((expr) => ctx.compileExpr(expr as SExpr, env))
      .toArray()
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

    ctx.emit(`${header} =l or ${header}, ${0b011}`)
    return header
  }
}

class DebugArray implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const arr = (await ctx.evaluate(car(exprs) as SExpr, env)) as VarArray
    console.log(`[${arr.value.length}]: [${arr.value.join(' ')}]`)
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    ctx.compileExpr(car(exprs) as SExpr, env)
    ctx.emit(Instruction.DebugArray)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const arr = ctx.unwrapArray(ctx.compileExpr(car(exprs) as SExpr, env)!, env)

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
    unwrapArray(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.unwrapArray = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l and ${x}, ${~0b111}`)
  return result
}
