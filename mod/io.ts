import type { QBEBackend, TreeWalkBackend } from '@/backend'
import type { QBE, TreeWalk } from '@/env'
import type { List } from '@/list'
import { car } from '@/pair'
import {
  unitConstructor,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
} from '@/type'
import type { Module } from '.'

class Print implements TreeWalkEvaluator, QBECompiler {
  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const value = (await ctx.evaluate(car(exprs) as SExpr, env)) as number
    await Bun.write(Bun.stdout, value.toString())
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const value = ctx.compileExpr(car(exprs) as SExpr, env)
    let i64Format: string
    if (ctx.env.has('i64_format')) {
      i64Format = ctx.env.lookup('i64_format') as string
    } else {
      i64Format = ctx.env.defineVar('i64_format')
      ctx.emitGlobal(`data ${i64Format} = { b "%lld", b 0 }`)
    }
    ctx.emit(`call $printf(l ${i64Format}, ..., l ${value})`)
    return null
  }
}

export default {
  name: 'IO',
  dependencies: [],
  unitConstructors: { print: unitConstructor(Print) },
  prelude: '',
} satisfies Module
