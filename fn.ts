import { Environment } from './env'
import type { List } from './list'
import { evaluate } from './native'
import { car, cdr } from './pair'
import { isNil, Raw, type Box, type SExpr, type Var } from './types'

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
    for (const param of this.params.fixed) {
      if (isNil(args)) {
        throw Error('calling function: missing arguments')
      }
      fnEnv.define(param, evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    if (this.params.rest !== '') {
      fnEnv.define(this.params.rest, args)
      while (!isNil(args)) {
        args[0] = evaluate(car(args) as SExpr, env)
        args = cdr(args) as List
      }
    }
    let result: Var = null
    for (const expr of this.body) {
      result = evaluate(expr, fnEnv)
    }
    return result
  }
}

export class NativeFn {
  constructor(public body: (...params: Var[]) => Var) {}

  apply(args: List, env: Environment) {
    const params = Array.of<Var>()
    while (!isNil(args)) {
      params.push(evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    return this.body(...params)
  }
}

export function nativeFn(body: (...params: Var[]) => Var) {
  return new Fn(new NativeFn(body))
}

export type Params = { fixed: string[]; rest: string }
