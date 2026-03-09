import { env } from './env'
import { nativeFn } from './fn'
import { typeOf, type Var } from './types'

export type Pair = [Var, Var]

export function cons(car: Var, cdr: Var): Pair {
  return [car, cdr]
}

env.define('cons', nativeFn(cons))

export function car(x: Var) {
  if (!isPair(x)) {
    throw Error(`calling \`car\`: expecting \`pair\`, found \`${typeOf(x)}\``)
  }
  return x[0]
}

env.define('car', nativeFn(car))

export function cdr(x: Var) {
  if (!isPair(x)) {
    throw Error(`calling \`cdr\`: expecting \`pair\`, found \`${typeOf(x)}\``)
  }
  return x[1]
}

env.define('cdr', nativeFn(cdr))

export function isPair(x: Var): x is Pair {
  return typeOf(x) === 'pair'
}

env.define('pair?', nativeFn(isPair))
