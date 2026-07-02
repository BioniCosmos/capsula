import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { iter, next, type List } from '@/list'
import { car } from '@/pair'
import {
  isSymbol,
  typeOf,
  type Box,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from '@/type'
import type { Module } from '.'

class Struct implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)

    const id = next(it, 'struct')
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(id)}\``,
      )
    }

    const fields = it
      .map((x) => {
        if (!isSymbol(x)) {
          throw Error(
            `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(x)}\``,
          )
        }
        return x.value
      })
      .toArray()

    env.define(id.value, new TreeWalkStructConstructor(fields))
    for (const field of fields) {
      env.define(`${id.value}-${field}`, new TreeWalkStructGetter(field))
    }
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {}

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {}
}

class TreeWalkStructConstructor implements TreeWalkEvaluator {
  constructor(private fields: string[]) {}

  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    const struct = new TreeWalkStructVal()
    for (const field of this.fields) {
      struct.val.set(
        field,
        await ctx.evaluate(next(it, 'struct-constructor') as SExpr, env),
      )
    }
    return struct
  }
}

class TreeWalkStructVal implements Box {
  type = 'struct'
  val = new Map<string, Var>()
}

class TreeWalkStructGetter implements TreeWalkEvaluator {
  constructor(private field: string) {}

  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const struct = await ctx.evaluate(car(exprs) as SExpr, env)
    if (!(struct instanceof TreeWalkStructVal)) {
      throw Error(
        `evaluating \`struct-getter\`: expecting \`TreeWalkStructVal\`, found \`${typeOf(struct)}\``,
      )
    }
    return struct.val.get(this.field)
  }
}

export default {
  name: 'struct',
  dependencies: [],
  units: { struct: Struct },
  prelude: '',
} satisfies Module
