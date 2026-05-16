import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
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
    const lhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Add]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    ctx.emit(`${name} =l add ${lhs}, ${rhs}`)
    return name
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
    const lhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Sub]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'sub') as SExpr, env)
    ctx.emit(`${name} =l sub ${lhs}, ${rhs}`)
    return name
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
    const lhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Mul]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'mul') as SExpr, env)
    ctx.emit(`${name} =l mul ${lhs}, ${rhs}`)
    return name
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
    const lhs = ctx.compileExpr(next(it, 'div') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'div') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Div]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'div') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'div') as SExpr, env)
    ctx.emit(`${name} =l div ${lhs}, ${rhs}`)
    return name
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
    const lhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Rem]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'rem') as SExpr, env)
    ctx.emit(`${name} =l rem ${lhs}, ${rhs}`)
    return name
  }
}

export default {
  name: 'integer',
  dependencies: [],
  units: { '+': Add, '-': Sub, '*': Mul, '/': Div, '%': Rem },
  prelude: '',
} satisfies Module
