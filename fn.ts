import { Environment } from './env'
import { iter, type List } from './list'
import { evaluate } from './native'
import { cons } from './pair'
import { Raw, type Box, type SExpr, type Var } from './types'

export class Fn extends Raw implements Box {
  type = 'fn'

  constructor(public value: SourceFn | NativeFn) {
    super()
  }

  override eval(exprs: List, env: Environment): Var {
    return this.value.apply(exprs, env)
  }
}

export class SourceFn {
  constructor(
    public env: Environment,
    public params: Params,
    public body: SExpr[],
  ) {}

  apply(args: List, env: Environment) {
    const fnEnv = new Environment(this.env)
    const it = iter(args)
    for (const param of this.params.fixed) {
      const { value, done } = it.next()
      if (done) {
        throw Error('calling function: missing arguments')
      }
      fnEnv.define(param, evaluate(value as SExpr, env))
    }
    if (this.params.rest !== '') {
      fnEnv.define(
        this.params.rest,
        it
          .toArray()
          .reduceRight((acc, x) => cons(evaluate(x as SExpr, env), acc), null),
      )
    }
    return this.body.reduce<Var>((_, expr) => evaluate(expr, fnEnv), null)
  }
}

export class NativeFn {
  constructor(public body: (...params: Var[]) => Var) {}

  apply(args: List, env: Environment) {
    return this.body(
      ...iter(args)
        .toArray()
        .map((x) => evaluate(x as SExpr, env)),
    )
  }
}

export function nativeFn(body: (...params: Var[]) => Var) {
  return new Fn(new NativeFn(body))
}

export type Params = { fixed: string[]; rest: string }
