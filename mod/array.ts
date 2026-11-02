import { type BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import { CallSite, num, type Params, qbeBox, qbeSegment, str, Unit } from '@/type'
import type { Module } from '.'

class Array extends Unit {
  override params: Params = { car: [], cdr: true }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    for (const arg of args.toReversed()) {
      ctx.emit(Instruction.Load(arg))
    }
    ctx.compileExpr(num(args.length), env)
    ctx.compileExpr(num(0), env)
    ctx.compileExpr(str('array-new'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    const arr = ctx.defineTemp(`alloc8 ${16 + args.length * 8}`, env)
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
    ctx.emit(`storel ${args.length}, ${p}`)
    // arr.data <- xs
    for (const x of args) {
      // arr.data[i] = x
      ctx.emit(`${p} =l add ${p}, ${8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }
    return arr
  }
}

class ArrayLen extends Unit {
  override params: Params = { car: ['arr'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[0]))
    ctx.compileExpr(str('array-len'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapI64(
      ctx.defineTemp(`loadl ${ctx.defineTemp(`add ${args[0]}, 8`, env)}`, env),
      env,
    )
  }
}

class ArrayAt extends Unit {
  override params: Params = { car: ['arr', 'i64'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.compileExpr(str('array-at'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    const offset = ctx.defineTemp(`mul ${ctx.unwrapI64(args[1], env)}, 8`, env)
    const addr = ctx.defineTemp(`add ${ctx.defineTemp(`add ${args[0]}, 16`, env)}, ${offset}`, env)
    return ctx.defineTemp(`loadl ${addr}`, env)
  }
}

export default {
  name: 'array',
  dependencies: [],
  units: { array: Array, 'array-len': ArrayLen, 'array-at': ArrayAt },
  prelude: '',
} satisfies Module
