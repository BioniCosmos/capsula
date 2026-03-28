import { Environment } from './env'
import { Fn } from './fn'
import { typeOf, type SExpr, type Var } from './types'

export function isString(x: Var): x is string {
  return typeOf(x) === 'str'
}

export function stringConcat(a: Var, b: Var) {
  if (!isString(a) || !isString(b)) {
    throw Error('calling `string-concat`: expecting `string`')
  }
  return a + b
}

export function init(
  env: Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
  parse: (input: string) => SExpr[],
  evaluate: (expr: SExpr, env: Environment) => Var,
) {
  env.define('string?', nativeFn(isString))
  env.define('string-concat', nativeFn(stringConcat))

  evaluate(
    parse(String.raw`
      (impl Add str
        (def add (lambda (self rhs) (string-concat self rhs))))
    `)[0],
    env,
  )
}
