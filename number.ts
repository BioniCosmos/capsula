import { Environment } from './env'
import { Fn } from './fn'
import { typeOf, type Var } from './types'

export function add(self: Var, rhs: Var) {
  if (!isNumber(self)) {
    throw Error(`calling \`add\`: expecting number, found \`${typeOf(self)}\``)
  }
  if (!isNumber(rhs)) {
    throw Error(`calling \`add\`: expecting number, found \`${typeOf(rhs)}\``)
  }
  return self + rhs
}

export function isNumber(x: Var): x is number {
  return typeOf(x) === 'num'
}

export function init(
  env: Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define('number?', nativeFn(isNumber))
}
