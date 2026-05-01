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
  type Var,
} from '@/type'
import type { Module } from '.'

class Add implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env): Var {
    const it = iter(exprs)
    return (
      (ctx.evaluate(next(it, 'add') as SExpr, env) as number) +
      (ctx.evaluate(next(it, 'add') as SExpr, env) as number)
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): Instruction[] {
    const it = iter(exprs)
    const lhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    return [...rhs, ...lhs, Instruction.Add]
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env): string | null {
    const it = iter(exprs)
    const name = env.defineTemp()
    const lhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, 'add') as SExpr, env)
    ctx.emit(`${name} =l add ${lhs}, ${rhs}`)
    return name
  }
}

export default {
  name: 'integer',
  dependencies: [],
  unitConstructors: { '+': unitConstructor(Add) },
  prelude: '',
} satisfies Module
