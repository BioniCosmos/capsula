import type { BytecodeBackend, TreeWalkBackend } from './backend'
import type { Instruction } from './bytecode'
import type { Bytecode, TreeWalk } from './env'
import { Fn } from './fn'
import type { List } from './list'
import type { Pair } from './pair'

export type Var = SExpr | Box | Unit

export type SExpr = null | boolean | number | string | Sym | Pair

export class Sym {
  constructor(public value: string) {}
}

export interface Box {
  type: string
}

export type Unit = TreeWalkEvaluator | BytecodeCompiler

export interface TreeWalkEvaluator {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env): Var
}

export function isTreeWalkEvaluator(x: any): x is TreeWalkEvaluator {
  return typeof x?.eval === 'function'
}

export interface BytecodeCompiler {
  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): Instruction[]
}

export function isBytecodeCompiler(x: any): x is BytecodeCompiler {
  return typeof x?.compile === 'function'
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

export function init(
  env: TreeWalk.Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define('nil?', nativeFn(isNil))
  env.define('boolean?', nativeFn(isBoolean))
  env.define('symbol?', nativeFn(isSymbol))
}
