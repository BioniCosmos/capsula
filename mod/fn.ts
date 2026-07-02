import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import { Bytecode, QBE, TreeWalk } from '@/env'
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

// TODO: rename to TreeWalkFn
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

// TODO: support rest parameters
export class BytecodeFn implements BytecodeCompiler {
  constructor(
    public idx: number,
    public env: Bytecode.Env,
    public required: Sym[],
  ) {
    for (const param of required) {
      env.defineVar(param.value)
    }
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)
    for (const _ of this.required) {
      ctx.compileExpr(next(it, 'fn') as SExpr, env)
    }
    ctx.emit(Instruction.Call(this.idx))
  }
}

// TODO:
//   1. Consider remove `required` and `rest`.
//   2. Rest parameters are not tested on all backends because of the lack of cons cell list. The array should be
//      replaced by list.
export class QBEFn implements QBECompiler {
  constructor(
    public id: string,
    public env: QBE.Env,
    private required: Sym[],
    private rest: Sym | null,
  ) {
    for (const param of required) {
      env.defineVar(param.value)
    }
    if (rest) {
      env.defineVar(rest.value)
    }
  }

  get params() {
    return this.required
      .concat(this.rest ? [this.rest] : [])
      .map((x) => `l ${this.env.lookup(x.value)}`)
      .join(', ')
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)

    const required: string[] = []
    for (const _ of this.required) {
      required.push(ctx.compileExpr(next(it, 'fn') as SExpr, env)!)
    }

    let rest: string | null = null
    if (this.rest) {
      rest = (ctx.env.lookup('array') as QBECompiler).compileToQBE(
        ctx,
        build(...it),
        env,
      )
    }

    const result = env.defineTemp()
    ctx.emit(
      `${result} =l call ${this.id}(${required
        .concat(rest !== null ? [rest] : [])
        .map((x) => `l ${x}`)
        .join('\n')})`,
    )
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

    const fn = new BytecodeFn(ctx.startFn(), new Bytecode.Env(env), required)
    env.defineVarUnit(id.value, fn)

    for (const param of fn.required.toReversed()) {
      ctx.emit(Instruction.Save(fn.env.lookup(param.value) as number))
    }
    for (const expr of it) {
      ctx.compileExpr(expr as SExpr, fn.env)
    }
    ctx.emit(Instruction.Ret)

    ctx.endFn(fn.env.localCount)
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
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

    // TODO: Generate id without defining new Var.
    const fn = new QBEFn(
      ctx.env.defineVar(id.value),
      new QBE.Env(env),
      required,
      rest,
    )
    env.defineVarUnit(id.value, fn)
    ctx.startFn(fn.id, fn.params)

    let result: string | null = null
    for (const expr of it) {
      result = ctx.compileExpr(expr as SExpr, fn.env)
    }

    ctx.endFn(result ?? ctx.compileExpr(undefined, env)!)
    return null
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
