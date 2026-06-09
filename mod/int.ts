import {
  QBEBackend,
  type BytecodeBackend,
  type TreeWalkBackend,
} from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { iter, next, type List } from '@/list'
import {
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
} from '@/type'
import type { Module } from '.'

class Add implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (
      ((await ctx.evaluate(next(it, 'add') as SExpr, env)) as number) +
      ((await ctx.evaluate(next(it, 'add') as SExpr, env)) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, 'add') as SExpr
    const rhs = next(it, 'add') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Add)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'add') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, 'add') as SExpr, env)!
    ctx.emit(
      `${result} =l add ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Sub implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (
      ((await ctx.evaluate(next(it, 'sub') as SExpr, env)) as number) -
      ((await ctx.evaluate(next(it, 'sub') as SExpr, env)) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, 'sub') as SExpr
    const rhs = next(it, 'sub') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Sub)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)!
    ctx.emit(
      `${result} =l sub ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Mul implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (
      ((await ctx.evaluate(next(it, 'mul') as SExpr, env)) as number) *
      ((await ctx.evaluate(next(it, 'mul') as SExpr, env)) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, 'mul') as SExpr
    const rhs = next(it, 'mul') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Mul)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)!
    ctx.emit(
      `${result} =l mul ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Div implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return Math.trunc(
      ((await ctx.evaluate(next(it, 'div') as SExpr, env)) as number) /
        ((await ctx.evaluate(next(it, 'div') as SExpr, env)) as number),
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, 'div') as SExpr
    const rhs = next(it, 'div') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Div)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'div') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, 'div') as SExpr, env)!
    ctx.emit(
      `${result} =l div ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Rem implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (
      ((await ctx.evaluate(next(it, 'rem') as SExpr, env)) as number) %
      ((await ctx.evaluate(next(it, 'rem') as SExpr, env)) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, 'rem') as SExpr
    const rhs = next(it, 'rem') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Rem)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)!
    ctx.emit(
      `${result} =l rem ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Lt implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (
      ((await ctx.evaluate(next(it, '<') as SExpr, env)) as number) <
      ((await ctx.evaluate(next(it, '<') as SExpr, env)) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const lhs = next(it, '<') as SExpr
    const rhs = next(it, '<') as SExpr
    ctx.compileExpr(rhs, env)
    ctx.compileExpr(lhs, env)
    ctx.emit(Instruction.Lt)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const result = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, '<') as SExpr, env)!
    const rhs = ctx.compileExpr(next(it, '<') as SExpr, env)!
    ctx.emit(`${result} =l csltl ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

class IsI64 implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const args = iter(exprs).toArray()
    if (args.length !== 1) {
      throw Error(`\`i64?\`: expecting 1 argument, found ${args.length}`)
    }
    const x = await ctx.evaluate(args[0] as SExpr, env)
    return typeof x === 'number'
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): void {
    const args = iter(exprs).toArray()
    if (args.length !== 1) {
      throw Error(`\`i64?\`: expecting 1 argument, found ${args.length}`)
    }
    ctx.compileExpr(args[0] as SExpr, env)
    ctx.emit(Instruction.IsI64)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env): string | null {
    const args = iter(exprs).toArray()
    if (args.length !== 1) {
      throw Error(`\`i64?\`: expecting 1 argument, found ${args.length}`)
    }

    const x = ctx.compileExpr(args[0] as SExpr, env)!
    const tag = ctx.tag(x, env)

    const result = env.defineTemp()
    ctx.emit(`${result} =l ceql ${tag}, ${0b010}`)
    return ctx.wrapBool(result, env)
  }
}

export default {
  name: 'integer',
  dependencies: [],
  units: {
    '+': Add,
    '-': Sub,
    '*': Mul,
    '/': Div,
    '%': Rem,
    '<': Lt,
    'i64?': IsI64,
  },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    wrapI64(x: string, env: QBE.Env): string
    unwrapI64(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.wrapI64 = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, ${0b010}`)
  return result
}

QBEBackend.prototype.unwrapI64 = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l sar ${x}, 3`)
  return result
}
