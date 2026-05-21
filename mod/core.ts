import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { isList, iter, next, type List } from '@/list'
import {
  isBoolean,
  isNil,
  typeOf,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from '@/type'
import type { Module } from '.'

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

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const bytecode = Array.of<Instruction>()

    const end = new Label()

    let nextClause = new Label()
    for (const clause of iter(exprs)) {
      if (!isList(clause) || isNil(clause)) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }

      nextClause.target = bytecode.length
      nextClause.fillOffset()
      nextClause = new Label()

      const it = iter(clause)
      const condition = ctx.compileExpr(next(it, 'cond') as SExpr, env)
      // TODO: check type
      bytecode.push(...condition)

      const jumpToNext = Instruction.BEQZ(0)
      nextClause.jumpFrom({ index: bytecode.length, instruction: jumpToNext })
      bytecode.push(jumpToNext)
      bytecode.push(
        ...it.reduce(
          (_, x) => ctx.compileExpr(x as SExpr, env),
          Array.of<Instruction>(),
        ),
      )

      const jumpToEnd = Instruction.Jump(0)
      end.jumpFrom({ index: bytecode.length, instruction: jumpToEnd })
      bytecode.push(jumpToEnd)
    }
    nextClause.target = bytecode.length
    nextClause.fillOffset()

    end.target = bytecode.length
    end.fillOffset()

    return bytecode
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

export default {
  name: 'core',
  dependencies: [],
  units: { cond: Cond },
  prelude: '',
} satisfies Module
