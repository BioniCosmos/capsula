import type { Backend, BytecodeBackend, QBEBackend } from './backend'
import { CodeBuffer, Instruction } from './bytecode'
import type { BytecodeEnv, Environment, QBEEnv } from './env'
import { error } from './utils'

export type SExprBool = { type: 'bool'; value: boolean }
export type SExprNum = { type: 'num'; value: number }
export type SExprStr = { type: 'str'; value: string }
export type SExprSym = { type: 'sym'; value: string; internal?: unknown }
export type SExprCell = { type: 'cell'; car: ASTNode[]; cdr: ASTNode | null }
export type SExpr = SExprBool | SExprNum | SExprStr | SExprSym | SExprCell
export type ASTMeta = { fileName: string; line: number; column: number }
export type ASTNode<T extends SExpr = SExpr> = { expr: T; meta: ASTMeta }

export function bool(value: boolean, meta: ASTMeta): ASTNode<SExprBool> {
  return { expr: { type: 'bool', value }, meta }
}

export function num(value: number, meta: ASTMeta): ASTNode<SExprNum> {
  return { expr: { type: 'num', value }, meta }
}

export function str(value: string, meta: ASTMeta): ASTNode<SExprStr> {
  return { expr: { type: 'str', value }, meta }
}

export function sym(value: string, meta: ASTMeta): ASTNode<SExprSym> {
  return { expr: { type: 'sym', value }, meta }
}

export function consCAR(car: ASTNode[], meta: ASTMeta): ASTNode<SExprCell> {
  return { expr: { type: 'cell', car, cdr: null }, meta }
}

export function internal(value: unknown, meta: ASTMeta): ASTNode<SExprSym> {
  return { expr: { type: 'sym', value: '', internal: value }, meta }
}

export function consWith(meta: ASTMeta) {
  return {
    bool: (x: boolean) => bool(x, meta),
    num: (x: number) => num(x, meta),
    str: (x: string) => str(x, meta),
    sym: (x: string) => sym(x, meta),
    consCAR: (x: ASTNode[]) => consCAR(x, meta),
    internal: (x: unknown) => internal(x, meta),
  }
}

export type PrimitiveType =
  'bool' | 'i64' | 'sym' | 'str' | 'arr' | 'struct' | 'fn' | 'any'

export const vmVarType = {
  unit: 0,
  bool: 1,
  i64: 2,
  arr: 3,
  struct: 4,
  str: 5,
}

export const qbeConst = {
  box: 0,
  bool: 0b001,
  false: 0b0001,
  true: 0b1001,
  unit: 0b10001,
  i64: 0b010,

  Box: `${0}`,
  Bool: `${0b001}`,
  False: `${0b0001}`,
  True: `${0b1001}`,
  Unit: `${0b10001}`,
  I64: `${0b010}`,
}

export const qbeBox = { scalar: 0, arr: 1, struct: 2, str: 3 }
export const qbeSegment = { stack: 0, heap: 1, data: 2 }

export function typeToVMVarType(paramType: PrimitiveType) {
  switch (paramType) {
    case 'sym':
      throw Error('unimplemented')
    case 'any':
      throw Error('`any` is not a real type.')
    default:
      return vmVarType[paramType]
  }
}

export function typeToQBETag(paramType: PrimitiveType) {
  switch (paramType) {
    case 'sym':
      throw Error('unimplemented')
    case 'any':
      throw Error('`any` is not a real type.')
    case 'arr':
    case 'struct':
    case 'str':
      return qbeConst.box
    default:
      return qbeConst[paramType]
  }
}

export function typeToQBEBox(paramType: PrimitiveType) {
  if (paramType in qbeBox) {
    return qbeBox[paramType as keyof typeof qbeBox]
  }
  throw Error(`\`${paramType}\` is not a box type.`)
}

export type Unit = Syntax | Fn

export abstract class Syntax {
  abstract isStatement?: boolean
  abstract bytecode(
    ctx: BytecodeBackend,
    env: BytecodeEnv,
    cell: ASTNode<SExprCell>,
  ): void
  abstract qbe(ctx: QBEBackend, env: QBEEnv, cell: ASTNode<SExprCell>): string
}

export abstract class Fn {
  abstract id: string
  abstract params: CheckRule
  abstract bytecode(
    ctx: BytecodeBackend,
    env: BytecodeEnv,
    args: number[],
  ): void
  abstract qbe(ctx: QBEBackend, env: QBEEnv, args: string[]): string
}

export function isUnit(x: any): x is Unit {
  return x instanceof Syntax || x instanceof Fn
}

export function compileCell(
  ctx: Backend,
  env: Environment,
  { expr: { car, cdr }, meta }: ASTNode<SExprCell>,
  compileOpExpr: (node: ASTNode) => unknown,
  runtimeCheckType: RuntimeTypeChecker,
  fnTypeError: string,
  compileArgs: ArgCompiler,
  call: (fn: unknown, args: unknown[]) => void,
) {
  if (cdr !== null) {
    error(cdr.meta, 'compiling: unexpected `cdr`')
  }

  if (car.length === 0) {
    error(meta, 'compiling: empty cell')
  }

  const opNode = car[0]
  const argNodes = car.slice(1)

  let unit: Unit | undefined
  let fnValue: unknown
  switch (opNode.expr.type) {
    case 'sym': {
      if (opNode.expr.internal !== undefined) {
        throw Error(`Internal value as a function is unsupported.`)
      }

      const op = env.lookup(opNode.expr.value)
      if (isUnit(op)) {
        unit = op
      } else {
        runtimeCheckType(ctx, env, 'fn', op, opNode.meta, fnTypeError)
        fnValue = op
      }

      break
    }
    case 'cell': {
      fnValue = compileOpExpr(opNode)
      runtimeCheckType(ctx, env, 'fn', fnValue, opNode.meta, fnTypeError)
      break
    }
    default:
      error(meta, `compiling: \`${opNode.expr.type}\` is not callable.`)
  }

  const args = compileArgs(ctx, env, argNodes)

  if (fnValue !== undefined) {
    call(fnValue, args)
    return
  }
  if (unit === undefined) {
    throw Error('unreachable')
  }
  if (unit instanceof Syntax) {
    return
  }
  // TODO: compile unit
}

export type ArgCompiler = (
  ctx: Backend,
  env: Environment,
  nodes: ASTNode[],
) => unknown[]

export function bytecodeCompileArgs(
  ctx: BytecodeBackend,
  env: BytecodeEnv,
  nodes: ASTNode[],
) {
  const args: number[] = []
  for (const node of nodes) {
    ctx.compileExpr(node, env)
    const arg = env.defineTemp()
    ctx.emit(Instruction.Save(arg))
    args.push(arg)
  }
  return args
}

export function qbeCompileArgs(ctx: QBEBackend, env: QBEEnv, nodes: ASTNode[]) {
  const args: string[] = []
  let protectCount = 0

  for (const node of nodes) {
    const arg = ctx.compileExpr(node, env)
    if (node.expr.type === 'cell') {
      ctx.emit(`call $gc_retain(l ${arg})`)
      protectCount++
    }
    args.push(arg)
  }

  for (let i = 0; i < protectCount; i++) {
    ctx.emit(`call $gc_release()`)
  }
  return args
}

export type CheckRule = { car?: PrimitiveType[]; cdr?: boolean }
export interface ArgumentChecker {
  checkRule: CheckRule
}

export function hasArgumentChecker(x: any): x is ArgumentChecker {
  return 'checkRule' in x
}

// all unit changes env should be blocked
// def defn struct...
// also break continue
// they are all statements
export function checkArgs(
  rule: CheckRule,
  ctx: Backend,
  env: Environment,
  { expr }: ASTNode<SExprCell>,
) {
  if (expr.cdr !== null) {
    error(expr.cdr.meta, 'compiling: unexpected `cdr`')
  }

  if (rule.car === undefined) {
    return
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
        if (!arg.expr.internal) {
          // TODO
          // ctx.runtimeCheckArg(paramType, env, arg)
        }
        break
      case 'cell':
        // TODO
        // ctx.runtimeCheckArg(paramType, env, arg)
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

export function checkType<T>(
  ctx: Backend,
  env: Environment,
  { id, params: { car, cdr } }: Fn,
  fnNode: ASTNode,
  argNodes: ASTNode[],
  // fnValue: T,
  // args: T[],
) {
  // if (fnNode.expr.type !== '')

  if (car === undefined) {
    return
  }

  if (argNodes.length < car.length) {
    error(
      fnNode.meta,
      `compiling: \`${id}\` expects ${cdr ? 'at least ' : ''}${car.length} arguments, but found ${argNodes.length}.`,
    )
  }
  if (!cdr && argNodes.length > car.length) {
    error(
      argNodes[car.length].meta,
      `compiling: \`${id}\` expects exactly ${car.length} arguments, but found ${argNodes.length}.`,
    )
  }

  for (const [i, paramType] of car.entries()) {
    if (paramType === 'any') {
      continue
    }

    const arg = args[i]
    const argType = arg.expr.type
    switch (argType) {
      case 'sym':
        if (!arg.expr.internal) {
          ctx.runtimeCheckArg(paramType, env, arg)
        }
        break
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

export type RuntimeTypeChecker = (
  ctx: Backend,
  env: Environment,
  type: PrimitiveType,
  x: unknown,
  meta: ASTMeta,
  format?: string,
) => void

export function bytecodeCheckType(
  ctx: BytecodeBackend,
  env: BytecodeEnv,
  type: PrimitiveType,
  x: number,
  meta: ASTMeta,
  format = `expecting \`${type}\`, found \`{}\``,
) {
  const { num, str } = consWith(meta)
  ctx.if(
    () => {
      ctx.emit(Instruction.Load(x))
      ctx.compileExpr(str('type-of'), env)
      ctx.emit(Instruction.NativeCall)
      ctx.compileExpr(num(typeToVMVarType(type)), env)
      ctx.emit(Instruction.Ne)
    },
    () => {
      ctx.emit(Instruction.Load(x))
      ctx.compileExpr(str('type-name'), env)
      ctx.emit(Instruction.NativeCall)
      ctx.panic(meta, format, env)
    },
  )
}

export function qbeCheckType(
  ctx: QBEBackend,
  env: QBEEnv,
  type: PrimitiveType,
  x: string,
  meta: ASTMeta,
  format = `expecting \`${type}\`, found \`%s\``,
) {
  const panic = () =>
    ctx.panic(
      meta,
      format,
      `l ${ctx.defineTemp(`call $type_name(l ${x})`, env)}`,
    )
  ctx.if(() => `cnew ${ctx.tag(x, env)}, ${typeToQBETag(type)}`, panic, {
    env,
  })
  if (type === 'arr' || type === 'struct' || type === 'str') {
    ctx.if(
      () => {
        const innerCheck = env.defineTemp()
        ctx.emit(`${innerCheck} =w loaduh ${x}`)
        ctx.emit(`${innerCheck} =w cnew ${innerCheck}, ${typeToQBEBox(type)}`)
        return innerCheck
      },
      panic,
      { env, predIsValue: true },
    )
  }
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
