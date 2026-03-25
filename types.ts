import { env, type Environment } from './env'
import { nativeFn } from './fn'
import type { List } from './list'
import type { Pair } from './pair'

export type Var = SExpr | Box

export type SExpr = null | boolean | number | string | Sym | Pair

export class Sym {
  constructor(public value: string) {}
}

export interface Box {
  type: string
}

export abstract class Raw {
  abstract eval(exprs: List, env: Environment): Var
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

export function isBoolean(x: Var): x is boolean {
  return typeOf(x) === 'bool'
}

export function isSymbol(x: Var): x is Sym {
  return typeOf(x) === 'sym'
}

export function isBox(x: Var): x is Box {
  return typeOf(x) === 'box'
}

export function init() {
  env.define('nil?', nativeFn(isNil))
  env.define('boolean?', nativeFn(isBoolean))
  env.define('symbol?', nativeFn(isSymbol))
}
