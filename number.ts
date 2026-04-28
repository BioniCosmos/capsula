import type { TreeWalk } from './env'
import { Fn } from './fn'
import type { Trait } from './trait'
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
  env: TreeWalk.Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define('number?', nativeFn(isNumber))

  const Add = env.lookup('Add') as Trait
  Add.register('num', 'add', nativeFn(add))
}
