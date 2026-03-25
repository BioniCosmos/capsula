import { env } from './env'
import { nativeFn } from './fn'
import { typeOf, type Var } from './types'

export function isString(x: Var): x is string {
  return typeOf(x) === 'str'
}

export function stringConcat(a: Var, b: Var) {
  if (!isString(a) || !isString(b)) {
    throw Error('calling `string-concat`: expecting `string`')
  }
  return a + b
}

export function init() {
  env.define('string?', nativeFn(isString))
  env.define('string-concat', nativeFn(stringConcat))
}
