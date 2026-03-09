import type { Environment } from './env'
import type { Box, SExpr, Var } from './types'

export class Fn implements Box {
  type = 'fn'

  constructor(public value: SourceFn | NativeFn) {}
}

export class SourceFn {
  constructor(
    public env: Environment,
    public params: string[],
    public body: SExpr[],
  ) {}
}

export class NativeFn {
  constructor(public body: (...params: Var[]) => Var) {}
}

export function nativeFn(body: (...params: Var[]) => Var) {
  return new Fn(new NativeFn(body))
}
