import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { build, isList, iter, next, type List } from '@/list'
import {
  isBoolean,
  isNil,
  isSymbol,
  typeOf,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from '@/type'
import type { Module } from '.'

class Eq implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    const lhs = await ctx.evaluate(next(it, '=') as SExpr, env)
    const rhs = await ctx.evaluate(next(it, '=') as SExpr, env)
    return lhs === rhs
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    ctx.compileExpr(next(it, '=') as SExpr, env)
    ctx.compileExpr(next(it, '=') as SExpr, env)
    ctx.emit(Instruction.Eq)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const lhs = ctx.compileExpr(next(it, '=') as SExpr, env)
    const rhs = ctx.compileExpr(next(it, '=') as SExpr, env)
    const result = env.defineTemp()
    ctx.emit(`${result} =l ceql ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

// TODO: support `else`
class Cond implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    for (const clause of iter(exprs)) {
      if (!isList(clause) || isNil(clause)) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }

      const it = iter(clause)
      const condition = await ctx.evaluate(next(it, 'cond') as SExpr, env)
      if (!isBoolean(condition)) {
        throw Error(
          `evaluating \`cond\`: expecting \`bool\`, found \`${typeOf(condition)}\``,
        )
      }

      if (condition) {
        return it.reduce<Promise<Var>>(
          (_, x) => ctx.evaluate(x as SExpr, env),
          Promise.resolve(undefined),
        )
      }
    }
    return undefined
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): void {
    const end = new Label()

    let nextClause = new Label()
    for (const clause of iter(exprs)) {
      if (!isList(clause) || isNil(clause)) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }

      nextClause.fillOffset(ctx.code.len)
      nextClause = new Label()

      const it = iter(clause)
      ctx.compileExpr(next(it, 'cond') as SExpr, env)
      // TODO: check type

      const jumpToNextFrom = ctx.code.len
      const jumpToNext = ctx.emit(Instruction.BEqZ(0))
      nextClause.jumpFrom({
        from: jumpToNextFrom,
        fill: (offset) => jumpToNext.setInt16(1, offset, true),
      })
      it.forEach((x) => ctx.compileExpr(x as SExpr, env))

      const jumpToEndFrom = ctx.code.len
      const jumpToEnd = ctx.emit(Instruction.Jump(0))
      end.jumpFrom({
        from: jumpToEndFrom,
        fill: (offset) => jumpToEnd.setInt16(1, offset, true),
      })
    }
    nextClause.fillOffset(ctx.code.len)

    end.fillOffset(ctx.code.len)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${ctx.compileExpr(undefined, env)}`)

    const end = env.defineBlock()

    let nextClause = env.defineBlock()
    for (const clause of iter(exprs)) {
      if (!isList(clause) || isNil(clause)) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }

      const current = nextClause
      nextClause = env.defineBlock()
      ctx.emit(current)

      const it = iter(clause)
      const condition = env.defineTemp()
      ctx.emit(
        `${condition} =l copy ${ctx.compileExpr(next(it, 'cond') as SExpr, env)}`,
      )
      // TODO: check type
      ctx.emit(`${condition} =l shr ${condition}, 3`)

      const body = env.defineBlock()
      ctx.emit(`jnz ${condition}, ${body}, ${nextClause}`)
      ctx.emit(body)
      ctx.emit(
        `${result} =l copy ${it.reduce(
          (_, x) => ctx.compileExpr(x as SExpr, env),
          ctx.compileExpr(undefined, env),
        )}`,
      )
      ctx.emit(`jmp ${end}`)
    }
    ctx.emit(nextClause)

    ctx.emit(end)

    return result
  }
}

class If implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env): Promise<Var> {
    const cond = env.lookup('cond') as TreeWalkEvaluator
    const it = iter(exprs)
    const condition = next(it, 'if')
    const then = next(it, 'if')
    const elseExpr = next(it, 'if')
    return cond.eval(
      ctx,
      build(build(condition, then), build(true, elseExpr)),
      env,
    )
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): void {
    const cond = env.lookup('cond') as BytecodeCompiler
    const it = iter(exprs)
    const condition = next(it, 'if')
    const then = next(it, 'if')
    const elseExpr = next(it, 'if')
    return cond.compile(
      ctx,
      build(build(condition, then), build(true, elseExpr)),
      env,
    )
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env): string | null {
    const cond = env.lookup('cond') as QBECompiler
    const it = iter(exprs)
    const condition = next(it, 'if')
    const then = next(it, 'if')
    const elseExpr = next(it, 'if')
    return cond.compileToQBE(
      ctx,
      build(build(condition, then), build(true, elseExpr)),
      env,
    )
  }
}

class Def implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    const sym = next(it, 'def')
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    env.define(sym.value, await ctx.evaluate(next(it, 'def') as SExpr, env))
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    const sym = next(it, 'def')
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    ctx.compileExpr(next(it, 'def') as SExpr, env)
    ctx.emit(Instruction.Save(env.defineVar(sym.value)))
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)
    const sym = next(it, 'def')
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    ctx.emit(
      `${env.defineVar(sym.value)} =l copy ${ctx.compileExpr(next(it, 'def') as SExpr, env)}`,
    )
    return null
  }
}

export default {
  name: 'core',
  dependencies: [],
  units: { '=': Eq, cond: Cond, if: If, def: Def },
  prelude: '',
} satisfies Module
