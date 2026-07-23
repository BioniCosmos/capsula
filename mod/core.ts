import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { build, isList, iter, next, type List } from '@/list'
import { car } from '@/pair'
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
// TODO: `(print (cond ...))` crashes under tree-walk. Fix it or consider returning other type when all are false.
class Cond implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    let result: Var = undefined

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
        for (const x of it) {
          result = await ctx.evaluate(x as SExpr, env)
        }
        break
      }
    }

    return result
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
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
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
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

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
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

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
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
    // Ensure that values are evaluated first, then assigned.
    const x = ctx.compileExpr(next(it, 'def') as SExpr, env)
    const id = env.defineSlot(sym.value)
    ctx.emitPrologue(`${id} =l alloc8 8`)
    ctx.emit(`storel ${x}, ${id}`)
    return null
  }
}

class Loop implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    while (true) {
      try {
        for (const expr of iter(exprs)) {
          await ctx.evaluate(expr as SExpr, env)
        }
      } catch {}
    }
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const start = ctx.code.len
    for (const expr of iter(exprs)) {
      ctx.compileExpr(expr as SExpr, env)
    }
    ctx.emit(Instruction.Jump(start - ctx.code.len))
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const loop = env.defineBlock()
    ctx.emit(loop)
    for (const expr of iter(exprs)) {
      ctx.compileExpr(expr as SExpr, env)
    }
    ctx.emit(`jmp ${loop}`)
    ctx.emit(env.defineBlock())
    return null
  }
}

class SizeOf implements QBECompiler {
  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const x = ctx.compileExpr(car(exprs) as SExpr, env)!

    const tag = env.defineVar('tag')
    ctx.emit(`${tag} =l copy ${ctx.tag(x, env)}`)
    const arrayTag = env.defineVar('array_tag')
    ctx.emit(`${arrayTag} =l copy ${0b011}`)
    // len := x.len
    const len = env.defineVar('len')
    ctx.emit(`${len} =l copy ${ctx.unwrapArray(x, env)}`)
    ctx.emit(`${len} =l add ${len}, 8`)
    ctx.emit(`${len} =l loadl ${len}`)
    ctx.emit(`${len} =l copy ${ctx.wrapI64(len, env)}`)

    return ctx.capl('(if (= tag array_tag) len 8)', env)
  }
}

class Call implements QBECompiler {
  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)

    const id = next(it, 'call') as SExpr
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`call\`: expecting \`symbol\`, found \`${typeOf(id)}\``,
      )
    }

    const args = it
      .map((arg) => `l ${ctx.compileExpr(arg as SExpr, env)}`)
      .toArray()
      .join(', ')

    const result = env.defineTemp()
    ctx.emit(`${result} =l call $${id.value}(${args})`)
    return result
  }
}

export default {
  name: 'core',
  dependencies: [],
  units: {
    '=': Eq,
    cond: Cond,
    if: If,
    def: Def,
    loop: Loop,
    'size-of': SizeOf,
    call: Call,
  },
  prelude: '',
} satisfies Module
