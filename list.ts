import { Environment } from './env'
import { Fn } from './fn'
import { car, cdr, isPair } from './pair'
import { isNil, typeOf, type Var } from './types'

export type List = null | [Var, List]

export function* iter(xs: Var) {
  while (isPair(xs)) {
    yield car(xs)
    xs = cdr(xs)
  }
  return xs
}

export function next(iter: Iterator<Var>, form: string): Var {
  const r = iter.next()
  if (r.done) {
    throw Error(`evaluating \`${form}\`: missing arguments`)
  }
  return r.value
}

export function collect<T, U>(iter: Iterator<T, U>): [T[], U] {
  let x = iter.next()
  const xs = Array.of<T>()
  while (!x.done) {
    xs.push(x.value)
    x = iter.next()
  }
  return [xs, x.value]
}

export function isList(x: Var): x is List {
  return isNil(x) || (isPair(x) && isList(cdr(x)))
}

export function length(x: Var): number {
  if (!isList(x)) {
    throw Error(`calling \`length\`: expecting list, found \`${typeOf(x)}\``)
  }
  if (isNil(x)) {
    return 0
  }
  return 1 + length(cdr(x))
}

export function init(
  env: Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define('list?', nativeFn(isList))
  env.define('length', nativeFn(length))
}
