import { env } from './env'
import { nativeFn } from './fn'
import { cdr, isPair } from './pair'
import { isNil, typeOf, type Var } from './types'

export type List = null | [Var, List]

export function isList(x: Var): x is List {
  return isNil(x) || (isPair(x) && isList(cdr(x)))
}

env.define('list?', nativeFn(isList))

export function length(x: Var): number {
  if (!isList(x)) {
    throw Error(`calling \`length\`: expecting list, found \`${typeOf(x)}\``)
  }
  if (isNil(x)) {
    return 0
  }
  return 1 + length(cdr(x))
}

env.define('length', nativeFn(length))
