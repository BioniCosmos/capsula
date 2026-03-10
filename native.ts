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
  Raw,
  typeOf,
  type Box,
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
  const box = evaluate(car(expr) as SExpr, env)
  if (box instanceof Raw) {
    return box.eval(cdr(expr) as List, env)
  }
  if (!(box instanceof Fn)) {
    throw Error(`evaluating: expecting function, found \`${typeOf(box)}\``)
  }
  const { value: fn } = box
  let args = cdr(expr) as List
  if (fn instanceof SourceFn) {
    const fnEnv = new Environment(fn.env)
    for (const param of fn.params) {
      if (isNil(args)) {
        throw Error('calling function: missing arguments')
      }
      fnEnv.define(param, evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    let result: Var = null
    for (const expr of fn.body) {
      result = evaluate(expr, fnEnv)
    }
    return result
  }
  if (fn instanceof NativeFn) {
    const params = Array.of<Var>()
    while (!isNil(args)) {
      params.push(evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    return fn.body(...params)
  }
  throw Error('unreachable')
}

class Def extends Raw implements Box {
  type = 'def'

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error(`evaluating \`def\`: missing arguments`)
    }
    const sym = car(exprs)
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    exprs = cdr(exprs) as List
    if (isNil(exprs)) {
      throw Error(`evaluating \`def\`: missing value`)
    }
    env.define(sym.value, evaluate(car(exprs) as SExpr, env))
    return null
  }
}

env.define('def', new Def())

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
