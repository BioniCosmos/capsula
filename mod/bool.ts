import { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { build, iter, next, type List } from '@/list'
import { car } from '@/pair'
import type { BytecodeCompiler, QBECompiler, TreeWalkEvaluator } from '@/type'
import type { Module } from '.'

class And implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (ctx.env.lookup('if') as TreeWalkEvaluator).eval(
      ctx,
      build(next(it, 'and'), next(it, 'and'), false),
      env,
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    ;(ctx.env.lookup('if') as BytecodeCompiler).compile(
      ctx,
      build(next(it, 'and'), next(it, 'and'), false),
      env,
    )
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    return (ctx.env.lookup('if') as QBECompiler).compileToQBE(
      ctx,
      build(next(it, 'and'), next(it, 'and'), false),
      env,
    )
  }
}

class Or implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    return (ctx.env.lookup('if') as TreeWalkEvaluator).eval(
      ctx,
      build(next(it, 'or'), true, next(it, 'or')),
      env,
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    ;(ctx.env.lookup('if') as BytecodeCompiler).compile(
      ctx,
      build(next(it, 'or'), true, next(it, 'or')),
      env,
    )
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    return (ctx.env.lookup('if') as QBECompiler).compileToQBE(
      ctx,
      build(next(it, 'or'), true, next(it, 'or')),
      env,
    )
  }
}

class Not implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    return (ctx.env.lookup('=') as TreeWalkEvaluator).eval(
      ctx,
      build(car(exprs), false),
      env,
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    ;(ctx.env.lookup('=') as BytecodeCompiler).compile(
      ctx,
      build(car(exprs), false),
      env,
    )
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    return (ctx.env.lookup('=') as QBECompiler).compileToQBE(
      ctx,
      build(car(exprs), false),
      env,
    )
  }
}

export default {
  name: 'bool',
  dependencies: ['core'],
  units: { and: And, or: Or, not: Not },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    wrapBool(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.wrapBool = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, 1`)
  return result
}
