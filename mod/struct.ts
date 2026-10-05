import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, Environment, QBEEnv } from '@/env'
import {
  qbeConst,
  type ArgumentChecker,
  type ASTNode,
  type BytecodeCompiler,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

class Struct implements BytecodeCompiler, QBECompiler {
  compile(_ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    Struct.#compileTo(cell, env)
  }

  compileToQBE(_ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    Struct.#compileTo(cell, env)
    return qbeConst.Unit
  }

  static #compileTo(cell: ASTNode<SExprCell>, env: Environment) {
    const [id, fields] = Struct.#checkArgs(cell)
    env.defineVarUnit(id, new StructConstructor(fields.length))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id}-${field}`, new StructGetter(i))
    }
  }

  static #checkArgs({ expr }: ASTNode<SExprCell>): [string, string[]] {
    if (expr.cdr !== null) {
      error(expr.cdr.meta, 'compiling: unexpected `cdr`')
    }
    const id = expr.car[1]
    if (id.expr.type !== 'sym') {
      error(
        id.meta,
        `compiling: The name of the struct must be a symbol, but got \`${id.expr.type}\`.`,
      )
    }
    const fields: string[] = []
    for (const field of expr.car.slice(2)) {
      if (field.expr.type !== 'sym') {
        error(
          field.meta,
          `compiling: Every field name of the struct must be a symbol, but got \`${field.expr.type}\`.`,
        )
      }
      fields.push(field.expr.value)
    }
    return [id.expr.value, fields]
  }
}

class StructConstructor implements BytecodeCompiler, QBECompiler {
  constructor(private count: number) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    this.#checkArgs(cell)
    for (const expr of cell.expr.car.slice(1).toReversed()) {
      ctx.compileExpr(expr, env)
    }
    ctx.compileExpr(
      { expr: { type: 'num', value: this.count }, meta: cell.meta },
      env,
    )
    ctx.compileExpr(
      { expr: { type: 'str', value: 'array-new' }, meta: cell.meta },
      env,
    )
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    this.#checkArgs(cell)
    const x = (ctx.env.lookup('array') as QBECompiler).compileToQBE(
      ctx,
      cell,
      env,
    )
    ctx.emit(`storel 1, ${ctx.unwrapArray(x, env)}`)
    return x
  }

  #checkArgs({ expr, meta }: ASTNode<SExprCell>) {
    if (expr.cdr !== null) {
      error(expr.cdr.meta, 'compiling: unexpected `cdr`')
    }
    const argCount = expr.car.length - 1
    if (argCount !== this.count) {
      error(
        meta,
        `Struct \`${expr.car[0]}\` expects ${this.count} field(s), but ${argCount} were given.`,
      )
    }
  }
}

class StructGetter implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  constructor(private offset: number) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.ArrayGet(this.offset))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.unwrapArray(ctx.compileExpr(cell.expr.car[1], env), env)
    return ctx.defineTemp(`add ${x}, ${16 + 8 * this.offset}`, env)
  }

  checkRule: CheckRule = { car: ['struct'] }
}

export default {
  name: 'struct',
  dependencies: ['array'],
  units: { struct: Struct },
  prelude: '',
} satisfies Module
