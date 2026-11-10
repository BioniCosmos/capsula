import type { BytecodeBackend, QBEBackend } from './backend'
import { CodeBuffer, Instruction } from './bytecode'
import { BytecodeEnv, type Environment, type QBEEnv } from './env'
import { error, mustLookup } from './utils'

export type SExprBool = { type: 'bool'; value: boolean }
export type SExprNum = { type: 'num'; value: number }
export type SExprStr = { type: 'str'; value: string }
export type SExprSym = { type: 'sym'; value: string; internal?: unknown }
export type SExprCell = { type: 'cell'; car: ASTNode[]; cdr: ASTNode | null }
export type SExpr = SExprBool | SExprNum | SExprStr | SExprSym | SExprCell
export type ASTMeta = { fileName: string; line: number; column: number }
export type ASTNode<T extends SExpr = SExpr> = { expr: T; meta: ASTMeta }

export function bool(value: boolean, meta = internalMeta): ASTNode<SExprBool> {
  return { expr: { type: 'bool', value }, meta }
}

export function num(value: number, meta = internalMeta): ASTNode<SExprNum> {
  return { expr: { type: 'num', value }, meta }
}

export function str(value: string, meta = internalMeta): ASTNode<SExprStr> {
  return { expr: { type: 'str', value }, meta }
}

export function sym(value: string, meta = internalMeta): ASTNode<SExprSym> {
  return { expr: { type: 'sym', value }, meta }
}

export function consCAR(car: ASTNode[], meta = internalMeta): ASTNode<SExprCell> {
  return { expr: { type: 'cell', car, cdr: null }, meta }
}

export function internal(value: unknown, meta = internalMeta): ASTNode<SExprSym> {
  return { expr: { type: 'sym', value: '', internal: value }, meta }
}

export function consWith(meta = internalMeta) {
  return {
    bool: (x: boolean) => bool(x, meta),
    num: (x: number) => num(x, meta),
    str: (x: string) => str(x, meta),
    sym: (x: string) => sym(x, meta),
    consCAR: (x: ASTNode[]) => consCAR(x, meta),
    internal: (x: unknown) => internal(x, meta),
  }
}

const internalMeta: ASTMeta = { fileName: '', line: 0, column: 0 }

export type PrimitiveType = 'bool' | 'i64' | 'sym' | 'str' | 'arr' | 'struct' | 'fn' | 'any'

export const vmVarType = {
  unit: 0,
  bool: 1,
  i64: 2,
  sym: 3,
  str: 4,
  fn: 6,
  arr: 100,
  struct: 101,
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

export const qbeBox = { scalar: 0, arr: 1, struct: 2, str: 3, fn: 4 }
export const qbeSegment = { stack: 0, heap: 1, data: 2 }

export function typeToVMVarType(paramType: PrimitiveType) {
  switch (paramType) {
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
    case 'fn':
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

export abstract class Unit {
  params: Params = {}
  lazy = false
  isStatement = false

  abstract bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, args: number[]): void
  abstract qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, args: string[]): string
}
export type UnitClass = new () => Unit

export class CallSite {
  constructor(public cell: ASTNode<SExprCell>) {}

  get operator() {
    return this.cell.expr.car[0]
  }

  get operands() {
    return this.cell.expr.car.slice(1)
  }
}

export function compileCell<T>(compiler: CellCompiler<T>, cell: ASTNode<SExprCell>) {
  const { env, fnTypeError } = compiler

  const {
    expr: { car, cdr },
    meta,
  } = cell
  if (cdr !== null) {
    error(cdr.meta, 'compiling: unexpected `cdr`')
  }
  if (car.length === 0) {
    error(meta, 'compiling: empty cell')
  }

  const opNode = car[0]
  const argNodes = car.slice(1)

  let op: Unit | T
  switch (opNode.expr.type) {
    case 'sym': {
      if (opNode.expr.internal !== undefined) {
        throw Error(`Internal value as a function is unsupported.`)
      }

      op = mustLookup(opNode as ASTNode<SExprSym>, env)
      if (!(op instanceof Unit)) {
        compiler.checkType('fn', op, opNode.meta, fnTypeError)
      }

      break
    }
    case 'cell': {
      op = compiler.compileOpExpr(opNode)
      compiler.checkType('fn', op, opNode.meta, fnTypeError)
      break
    }
    default:
      error(meta, `compiling: \`${opNode.expr.type}\` is not callable.`)
  }

  const site = new CallSite(cell)
  const args = op instanceof Unit && op.lazy ? [] : compiler.compileArgs(argNodes)
  if (!(op instanceof Unit)) {
    compiler.call(op, args)
    return
  }
  checkArgs(compiler, op, site, args)
  compiler.compileUnit(op, site, args)
}

interface CellCompiler<T> {
  env: Environment<T>
  checkType(type: PrimitiveType, x: T, meta: ASTMeta, format?: string): void
  compileOpExpr(node: ASTNode): T
  fnTypeError: string
  compileArgs(nodes: ASTNode[]): T[]
  call(fn: T, args: T[]): void
  compileUnit(unit: Unit, site: CallSite, args: T[]): void
}

export class BytecodeCellCompiler implements CellCompiler<number> {
  constructor(
    private ctx: BytecodeBackend,
    public env: BytecodeEnv,
  ) {}

  checkType(type: PrimitiveType, x: number, meta: ASTMeta, format?: string) {
    bytecodeCheckType(this.ctx, this.env, type, x, meta, format)
  }

  compileOpExpr(node: ASTNode) {
    const fn = this.env.defineTemp()
    this.ctx.compileExpr(node, this.env)
    this.ctx.emit(Instruction.Save(fn))
    return fn
  }

  fnTypeError = '`{}` is not callable.'

  compileArgs(nodes: ASTNode[]) {
    const args: number[] = []
    for (const node of nodes) {
      this.ctx.compileExpr(node, this.env)
      const arg = this.env.defineTemp()
      this.ctx.emit(Instruction.Save(arg))
      args.push(arg)
    }
    return args
  }

  call(fn: number, args: number[]) {
    for (const arg of args.toReversed()) {
      this.ctx.emit(Instruction.Load(arg))
    }
    this.ctx.emit(Instruction.Call(fn))
  }

  compileUnit(unit: Unit, site: CallSite, args: number[]) {
    unit.bytecode(this.ctx, this.env, site, args)
  }
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

export type Params = {
  car?: PrimitiveType[]
  cdr?: boolean
  body?: boolean
  check?(site: CallSite): void
}

export function checkArgs<T>(compiler: CellCompiler<T>, unit: Unit, site: CallSite, args: T[]) {
  const { operator, operands } = site
  const { car, cdr, body, check } = unit.params

  if (!body) {
    for (const node of operands) {
      if (node.expr.type !== 'cell') {
        continue
      }
      const opNode = node.expr.car.at(0)
      if (opNode === undefined || opNode.expr.type !== 'sym') {
        continue
      }
      const unit = compiler.env.lookup(opNode.expr.value)
      if (unit instanceof Unit && unit.isStatement) {
        error(opNode.meta, 'compiling: Statements are not allowed in an expression context.')
      }
    }
  }

  if (car !== undefined) {
    const fnId = (operator.expr as SExprSym).value
    if (operands.length < car.length) {
      error(
        operator.meta,
        `compiling: \`${fnId}\` expects ${cdr ? 'at least ' : ''}${car.length} arguments, but found ${operands.length}.`,
      )
    }
    if (!cdr && operands.length > car.length) {
      error(
        operands[car.length].meta,
        `compiling: \`${fnId}\` expects exactly ${car.length} arguments, but found ${operands.length}.`,
      )
    }

    for (const [i, paramType] of car.entries()) {
      if (paramType === 'any') {
        continue
      }

      const argNode = operands[i]
      const argType = argNode.expr.type
      switch (argType) {
        case 'sym':
          if (!argNode.expr.internal && !unit.lazy) {
            compiler.checkType(paramType, args[i], argNode.meta)
          }
          break
        case 'cell':
          if (!unit.lazy) {
            compiler.checkType(paramType, args[i], argNode.meta)
          }
          break
        case 'num':
          if (!Number.isInteger(argNode.expr.value)) {
            error(argNode.meta, `compiling: Float number is currently unsupported.`)
          }
          if (paramType !== 'i64') {
            error(argNode.meta, `compiling: expecting \`${paramType}\`, found \`i64\``)
          }
          break
        default:
          if (argType !== paramType) {
            error(argNode.meta, `compiling: expecting \`${paramType}\`, found \`${argType}\``)
          }
      }
    }
  }

  check?.(site)
}

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
  const panic = () => ctx.panic(meta, format, `l ${ctx.defineTemp(`call $type_name(l ${x})`, env)}`)
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

export function compileSym(ctx: BytecodeBackend, env: BytecodeEnv, node: ASTNode<SExprSym>) {
  const { expr, meta } = node

  if (expr.internal !== undefined) {
    if (typeof expr.internal !== 'number') {
      throw Error('invalid internal value')
    }
    ctx.emit(Instruction.Load(expr.internal))
    return
  }

  const x = mustLookup(node, env)

  if (typeof x === 'number') {
    ctx.emit(Instruction.Load(x))
    return
  }

  if (x.params.car === undefined || x.lazy || x.isStatement) {
    error(meta, 'compiling: Syntax itself cannot be used as an expression.')
    // throw Error(
    //   'unreachable: `compileCell` guarantees that `Syntax` will not appear here.',
    // )
  }

  const fnAddr = ctx.startFn()
  const fnScope = new BytecodeEnv(null, true)
  const args: number[] = []
  for (let i = 0; i < x.params.car.length; i++) {
    ctx.emit(Instruction.Save(env.defineTemp()))
  }
  if (x.params.cdr) {
    ctx.emit(Instruction.Save(env.defineTemp()))
  }
  x.bytecode(ctx, fnScope, new CallSite({ expr: { type: 'cell', car: [], cdr: null }, meta }), args)
  ctx.endFn(fnScope.sp!)
  ctx.compileExpr(num(fnAddr, meta), env)
  ctx.compileExpr(str('fn', meta), env)
  ctx.emit(Instruction.NativeCall)
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
