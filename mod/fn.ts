import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { TreeWalk, type Bytecode, type QBE } from '@/env'
import { build, collect, iter, next, type List } from '@/list'
import {
  isNil,
  isSymbol,
  Sym,
  typeOf,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from '@/type'
import type { Module } from '.'

class Fn implements TreeWalkEvaluator {
  constructor(
    private env: TreeWalk.Env,
    private required: Sym[],
    private rest: Sym | null,
    private body: SExpr[],
  ) {}

  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const scope = new TreeWalk.Env(this.env)
    const it = iter(exprs)

    for (const param of this.required) {
      scope.define(
        param.value,
        await ctx.evaluate(next(it, 'fn') as SExpr, env),
      )
    }
    if (this.rest) {
      const xs = Array.of<Var>()
      for (const x of it) {
        xs.push(await ctx.evaluate(x as SExpr, env))
      }
      scope.define(this.rest.value, build(...xs))
    }

    let result: Var = undefined
    for (const expr of this.body) {
      result = await ctx.evaluate(expr, scope)
    }
    return result
  }
}

// TODO: support optional/default and named parameters
class Defn implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(_ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)

    const id = next(it, 'defn')
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`defn\`: expecting symbol, found \`${typeOf(id)}\``,
      )
    }

    const [required, rest] = collect(iter(next(it, 'defn')))
    // Ensure all required parameters are symbol.
    Defn.#assertAllSymbols(required)
    // Ensure the rest parameter is a symbol.
    if (!isNil(rest) && !isSymbol(rest)) {
      throw Error(
        `evaluating \`defn\`: expecting \`symbol\`, found \`${typeOf(rest)}\``,
      )
    }

    env.define(id.value, new Fn(env, required, rest, it.toArray() as SExpr[]))
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    throw Error('TODO')
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env): any {
    throw Error('TODO')
  }

  static #assertAllSymbols(xs: Var[]): asserts xs is Sym[] {
    if (xs.length > 0) {
      const illegal = xs.find((x) => !isSymbol(x))
      if (illegal !== undefined) {
        throw Error(
          `evaluating \`defn\`: expecting \`symbol\`, found \`${typeOf(illegal)}\``,
        )
      }
    }
  }
}

export default {
  name: 'fn',
  dependencies: [],
  units: { defn: Defn },
  prelude: '',
} satisfies Module
