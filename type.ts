import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from './backend'
import { CodeBuffer } from './bytecode'
import type { Bytecode, QBE, TreeWalk } from './env'
import type { List } from './list'
import type { Pair } from './pair'

export type Var = SExpr | Box | Unit

// TODO: Redesign/Tidy up. Remove null. Distinguish compile-time (AST?) and runtime type.
export type SExpr = void | null | boolean | number | string | Sym | Pair

export class Sym {
  constructor(public value: string) {}
}

// TODO: Consider reactivate Box and make difference between Box and Unit (e.g. stateful v.s. stateless).
export interface Box {
  type: string
}

export type Unit = TreeWalkEvaluator | BytecodeCompiler | QBECompiler

const unitConstructorSymbol = Symbol('unit-constructor')

export type UnitClass<T extends Unit = Unit> = new () => T

export type UnitConstructor<T extends Unit> = {
  (): T
  readonly [unitConstructorSymbol]: true
}

export function unitConstructor<T extends Unit>(Unit: UnitClass<T>) {
  const cons = () => new Unit()
  Object.defineProperty(cons, unitConstructorSymbol, { value: true })
  return cons as UnitConstructor<T>
}

export function isUnitConstructor<T extends Unit>(
  target: any,
): target is UnitConstructor<T> {
  return typeof target === 'function' && target[unitConstructorSymbol] === true
}

export interface TreeWalkEvaluator {
  eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env): Var | Promise<Var>
}

export function isTreeWalkEvaluator(x: any): x is TreeWalkEvaluator {
  return typeof x?.eval === 'function'
}

export interface BytecodeCompiler {
  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env): void
}

export function isBytecodeCompiler(x: any): x is BytecodeCompiler {
  return typeof x?.compile === 'function'
}

// TODO: Consider return string only. `void` should be represented by actual value.
export interface QBECompiler {
  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env): string | null
}

export function isQBECompiler(x: any): x is QBECompiler {
  return typeof x?.compileToQBE === 'function'
}

export class BytecodeFnChunk {
  code = new CodeBuffer()
  constants: SExpr[] = []
  localCount = 0

  serialize() {
    return {
      code: this.code.u8Array,
      constants: this.constants.map((x) => {
        switch (typeOf(x)) {
          case 'bool':
            return [1, x]
          case 'num':
            return [2, x]
        }
      }),
      local_count: this.localCount,
    }
  }

  toString() {
    return `code =
${this.code.toString('  ')}
constants = [${this.constants.join(' ')}]
localCount = ${this.localCount}`
  }
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

export function isNumber(x: Var): x is number {
  return typeOf(x) === 'num'
}

export function isSymbol(x: Var): x is Sym {
  return typeOf(x) === 'sym'
}

export function isBox(x: Var): x is Box {
  return typeOf(x) === 'box'
}
