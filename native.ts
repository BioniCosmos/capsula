import { env, Environment } from './env'
import { Fn, nativeFn, NativeFn, SourceFn } from './fn'
import { isList, type List } from './list'
import { isNumber, add as numAdd } from './number'
import { car, cdr } from './pair'
import {
  isBoolean,
  isNil,
  isString,
  isSymbol,
  typeOf,
  type SExpr,
  type Var,
} from './types'

export const dispatcher: Map<string, Map<string, Function>> = new Map([
  ['+', new Map([['num', numAdd]])],
])

export function evaluate(expr: SExpr, env: Environment): Var {
  if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
    return expr
  }
  if (isSymbol(expr)) {
    return env.lookup(expr.value)
  }
  if (!isList(expr)) {
    throw Error('evaluating: expecting list, found pair')
  }
  const fn = evaluate(car(expr) as SExpr, env)
  if (!(fn instanceof Fn)) {
    throw Error(`evaluating: expecting function, found \`${typeOf(fn)}\``)
  }
  let args = cdr(expr) as List
  const f = fn.value
  if (f instanceof SourceFn) {
    const fnEnv = new Environment(f.env)
    for (const param of f.params) {
      if (isNil(args)) {
        throw Error('calling function: missing arguments')
      }
      fnEnv.define(param, evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    let result: Var = null
    for (const expr of f.body) {
      result = evaluate(expr, fnEnv)
    }
    return result
  }
  if (f instanceof NativeFn) {
    const params = Array.of<Var>()
    while (!isNil(args)) {
      params.push(evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    return f.body(...params)
  }
  throw Error('unreachable')
}

env.define(
  '+',
  nativeFn((...xs) => {
    const fn = dispatcher.get('+')?.get(typeOf(xs[0]))
    if (!fn) {
      throw Error('function calling dispatching: failed to find a candidate')
    }
    if (xs.length === 0) {
      return { type: 'nil' }
    }
    if (xs.length === 1) {
      return xs[0]
    }
    return xs.reduce((acc, x) => {
      return fn(acc, x)
    })
  }),
)
