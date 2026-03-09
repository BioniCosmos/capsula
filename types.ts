import { env } from './env'
import { nativeFn } from './fn'
import type { Pair } from './pair'

export type Var = SExpr | Box

export type SExpr = null | boolean | number | string | Sym | Pair

export class Sym {
  constructor(public value: string) {}
}

export interface Box {
  type: string
}

export function typeOf(x: Var) {
  if (x === null) {
    return 'nil'
  }
  if (typeof x === 'boolean') {
    return 'bool'
  }
  if (typeof x === 'number') {
    return 'num'
  }
  if (typeof x === 'string') {
    return 'str'
  }
  if (x instanceof Sym) {
    return 'sym'
  }
  if (Array.isArray(x)) {
    return 'pair'
  }
  if (typeof x === 'object' && 'type' in x) {
    return 'box'
  }
  throw `invalid expression: ${x}`
}

export function isNil(x: Var): x is null {
  return typeOf(x) === 'nil'
}

env.define('nil?', nativeFn(isNil))

export function isBoolean(x: Var): x is boolean {
  return typeOf(x) === 'bool'
}

env.define('boolean?', nativeFn(isBoolean))

export function isString(x: Var): x is string {
  return typeOf(x) === 'str'
}

env.define('string?', nativeFn(isString))

export function isSymbol(x: Var): x is Sym {
  return typeOf(x) === 'sym'
}

env.define('symbol?', nativeFn(isSymbol))

export function isBox(x: Var): x is Box {
  return typeOf(x) === 'box'
}
