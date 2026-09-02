import type { Backend, BytecodeBackend, QBEBackend } from './backend'
import { CodeBuffer } from './bytecode'
import type { BytecodeEnv, Environment, QBEEnv } from './env'
import { error } from './utils'

export type SExprBool = { type: 'bool'; value: boolean }
export type SExprNum = { type: 'num'; value: number }
export type SExprStr = { type: 'str'; value: string }
export type SExprSym = { type: 'sym'; value: string }
export type SExprCell = { type: 'cell'; car: ASTNode[]; cdr: ASTNode | null }
export type SExpr = SExprBool | SExprNum | SExprStr | SExprSym | SExprCell
export type ASTMeta = { fileName: string; line: number; column: number }
export type ASTNode<T extends SExpr = SExpr> = { expr: T; meta: ASTMeta }

export type PrimitiveType =
  'bool' | 'i64' | 'sym' | 'str' | 'arr' | 'struct' | 'any'

export const vmVarType = {
  unit: 0,
  bool: 1,
  i64: 2,
  array: 3,
}

export const qbeConst = {
  box: 0,
  bool: 0b001,
  false: 0b0001,
  true: 0b1001,
  unit: 0b10001,
  i64: 0b010,
  array: 0b011,

  Box: `${0}`,
  Bool: `${0b001}`,
  False: `${0b0001}`,
  True: `${0b1001}`,
  Unit: `${0b10001}`,
  I64: `${0b010}`,
  Array: `${0b011}`,
}

export function typeToVMVarType(paramType: PrimitiveType) {
  switch (paramType) {
    case 'bool':
      return vmVarType.bool
    case 'i64':
      return vmVarType.i64
    case 'arr':
      return vmVarType.array
    case 'any':
      throw Error('`any` is not a real type.')
    default:
      throw Error('unimplemented')
  }
}

export function typeToQBETag(paramType: PrimitiveType) {
  switch (paramType) {
    case 'bool':
      return qbeConst.bool
    case 'i64':
      return qbeConst.i64
    case 'arr':
    case 'struct':
      return qbeConst.array
    case 'any':
      throw Error('`any` is not a real type.')
    default:
      throw Error('unimplemented')
  }
}

export type Unit = BytecodeCompiler | QBECompiler
const unitSymbol = Symbol('unit')
const unitConstructorSymbol = Symbol('unit-constructor')
export type UnitClass<T extends Unit = Unit> = new () => T
export type UnitConstructor<T extends Unit> = {
  (): T
  readonly [unitConstructorSymbol]: true
}

export function unitConstructor<T extends Unit>(Unit: UnitClass<T>) {
  const cons = () => {
    const unit = new Unit()
    Object.defineProperty(unit, unitSymbol, { value: true })
    return unit
  }
  Object.defineProperty(cons, unitConstructorSymbol, { value: true })
  return cons as UnitConstructor<T>
}

export function isUnit(x: any): x is Unit {
  return x[unitSymbol] === true
}

export function isUnitConstructor<T extends Unit>(
  target: any,
): target is UnitConstructor<T> {
  return typeof target === 'function' && target[unitConstructorSymbol] === true
}

export type CheckRule = { car: PrimitiveType[]; cdr?: boolean }
export interface ArgumentChecker {
  checkRule: CheckRule
}

export function hasArgumentChecker(x: any): x is ArgumentChecker {
  return 'checkRule' in x
}

export function checkArgs(
  rule: CheckRule,
  ctx: Backend<Unit, unknown>,
  env: Environment<Unit>,
  { expr }: ASTNode<SExprCell>,
) {
  if (expr.cdr !== null) {
    error(expr.cdr.meta, 'compiling: unexpected `cdr`')
  }

  const { car } = expr
  const unit = car[0]
  const unitValue = (unit.expr as SExprSym).value

  const args = car.slice(1)
  const paramLen = rule.car.length
  const argLen = args.length

  if (argLen < paramLen) {
    error(
      unit.meta,
      `compiling: \`${unitValue}\` expects ${rule.cdr ? 'at least ' : ''}${paramLen} arguments, but found ${argLen}.`,
    )
  }
  if (!rule.cdr && argLen > paramLen) {
    error(
      args[paramLen].meta,
      `compiling: \`${unitValue}\` expects exactly ${paramLen} arguments, but found ${argLen}.`,
    )
  }

  for (const [i, paramType] of rule.car.entries()) {
    if (paramType === 'any') {
      continue
    }

    const arg = args[i]
    const argType = arg.expr.type
    switch (argType) {
      case 'sym':
      case 'cell':
        ctx.runtimeCheckArg(paramType, env, arg)
        break
      case 'num':
        if (!Number.isInteger(arg.expr.value)) {
          error(arg.meta, `compiling: Float number is currently unsupported.`)
        }
        if (paramType !== 'i64') {
          error(
            arg.meta,
            `compiling: expecting \`${paramType}\`, found \`i64\``,
          )
        }
        break
      default:
        if (argType !== paramType) {
          error(
            arg.meta,
            `compiling: expecting \`${paramType}\`, found \`${argType}\``,
          )
        }
    }
  }
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
  constants: (SExprBool | SExprNum | SExprStr)[] = []
  localCount = 0

  serialize() {
    return {
      code: this.code.u8Array,
      constants: this.constants.map((x) => x.value),
      local_count: this.localCount,
    }
  }

  toString() {
    return `code =
${this.code.toString('  ')}
constants = [${this.constants.map((x) => (x.type === 'str' ? `"${x.value}"` : x.value)).join(' ')}]
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
${this.#prologue.map((line) => (line.startsWith('@') ? line : `    ${line}`)).join('\n')}
${this.#body.map((line) => (line.startsWith('@') ? line : `    ${line}`)).join('\n')}
}`
  }
}
