import type { TreeWalk } from './env'
import { Fn } from './fn'
import type { List } from './list'
import { typeOf, type Var } from './type'

export type Pair = [Var, Var]

export function cons(car: Var, cdr: Var): Pair {
  return [car, cdr]
}

export function car(x: Var) {
  if (!isPair(x)) {
    throw Error(`calling \`car\`: expecting \`pair\`, found \`${typeOf(x)}\``)
  }
  return x[0]
}

export function cdr(x: [Var, List]): List
export function cdr(x: Var): Var
export function cdr(x: Var): Var {
  if (!isPair(x)) {
    throw Error(`calling \`cdr\`: expecting \`pair\`, found \`${typeOf(x)}\``)
  }
  return x[1]
}

export function isPair(x: Var): x is Pair {
  return typeOf(x) === 'pair'
}

export function init(
  env: TreeWalk.Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define('cons', nativeFn(cons))
  env.define('car', nativeFn(car))
  env.define('cdr', nativeFn(cdr))
  env.define('pair?', nativeFn(isPair))
}
