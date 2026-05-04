import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { iter, next, type List } from '@/list'
import {
  unitConstructor,
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

export default {
  name: 'integer',
  dependencies: [],
  unitConstructors: { '+': unitConstructor(Add), '-': unitConstructor(Sub) },
  prelude: '',
} satisfies Module
