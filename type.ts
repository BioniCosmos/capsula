import type { BytecodeBackend, QBEBackend } from './backend'
import { CodeBuffer } from './bytecode'
import type { BytecodeEnv, QBEEnv } from './env'

export type SExprBool = { type: 'bool'; value: boolean }
export type SExprNum = { type: 'num'; value: number }
export type SExprStr = { type: 'str'; value: string }
export type SExprSym = { type: 'sym'; value: string }
export type SExprCell = { type: 'cell'; car: ASTNode[]; cdr: ASTNode | null }
export type SExpr = SExprBool | SExprNum | SExprStr | SExprSym | SExprCell
export type ASTMeta = { fileName: string; line: number; column: number }
export type ASTNode<T extends SExpr = SExpr> = { expr: T; meta: ASTMeta }

export const qbeUnit = (0b10001).toString()
export const qbeTrue = (0b1001).toString()
export const qbeFalse = (0b0001).toString()

export type Unit = BytecodeCompiler | QBECompiler
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

export interface BytecodeCompiler {
  compile(
    ctx: BytecodeBackend,
    cell: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ): void
}

export function isBytecodeCompiler(x: any): x is BytecodeCompiler {
  return typeof x?.compile === 'function'
}

export interface QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv): string
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
        switch (x.type) {
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

export class QBEFnChunk {
  #declaration
  #prologue: string[] = []
  #body: string[] = []

  constructor(id: string, params: string, type = 'l', isExport = false) {
    this.#declaration = `${isExport ? 'export ' : ''}function ${type} ${id}(${params})`
  }

  emit(code: string) {
    this.#body.push(code)
  }

  emitPrologue(code: string) {
    this.#prologue.push(code)
  }

  build() {
    return `${this.#declaration} {
@start
${this.#prologue.map((line) => `    ${line}`).join('\n')}
${this.#body.map((line) => `    ${line}`).join('\n')}
}`
  }
}
