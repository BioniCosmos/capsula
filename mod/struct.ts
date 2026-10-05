import type { Backend, BytecodeBackend, QBEBackend } from '@/backend'
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
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    Struct.#compileTo(ctx, cell, env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    Struct.#compileTo(ctx, cell, env)
    return qbeConst.Unit
  }

  static #compileTo(ctx: Backend, cell: ASTNode<SExprCell>, env: Environment) {
    const id = ctx.env.structs.idCounter++
    const [name, fields] = Struct.#checkArgs(cell)
    env.defineVarUnit(name, new StructConstructor(id, fields.length))
    ctx.env.structs.names.push(name)
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${name}-${field}`, new StructGetter(id, i))
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
  constructor(
    private id: number,
    private fieldCount: number,
  ) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    this.#checkArgs(cell)
    for (const expr of cell.expr.car.slice(1).toReversed()) {
      ctx.compileExpr(expr, env)
    }
    ctx.compileExpr(
      { expr: { type: 'num', value: this.fieldCount }, meta: cell.meta },
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

    const xs = ctx.compileArgs(cell, env)
    // struct := { id: u64; type: u64; len: u64; data: ... }
    const struct = ctx.defineTemp(`alloc8 ${24 + xs.length * 8}`, env)
    const p = ctx.defineTemp(`copy ${struct}`, env)
    // struct.id = id
    ctx.emit(`storel ${this.id}, ${p}`)
    // struct.type = 1
    ctx.emit(`${p} =l add ${p}, 8`)
    ctx.emit(`storel 1, ${p}`)
    // struct.len = xs.len
    ctx.emit(`${p} =l add ${p}, 8`)
    ctx.emit(`storel ${xs.length}, ${p}`)
    // struct.data <- xs
    for (const x of xs) {
      // struct.data[i] = x
      ctx.emit(`${p} =l add ${p}, ${8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }

    return ctx.wrapArray(ctx.defineTemp(`add ${struct}, 8`, env), env)
  }

  #checkArgs({ expr, meta }: ASTNode<SExprCell>) {
    if (expr.cdr !== null) {
      error(expr.cdr.meta, 'compiling: unexpected `cdr`')
    }
    const argCount = expr.car.length - 1
    if (argCount !== this.fieldCount) {
      error(
        meta,
        `Struct \`${expr.car[0]}\` expects ${this.fieldCount} field(s), but ${argCount} were given.`,
      )
    }
  }
}

class StructGetter implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  constructor(
    private id: number,
    private offset: number,
  ) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.ArrayGet(this.offset))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const node = cell.expr.car[1]
    const x = ctx.unwrapArray(ctx.compileExpr(node, env), env)
    const id = ctx.defineTemp(
      `loadl ${ctx.defineTemp(`sub ${x}, 8`, env)}`,
      env,
    )
    ctx.if(
      () => ctx.defineTemp(`cnel ${id}, ${this.id}`, env),
      () =>
        ctx.panic(
          node.meta,
          'expecting a value of struct `%s`, but got a value of struct `%s`',
          `l ${ctx.defineTemp(`add $structs, ${this.id * 8}`, env)}`,
          `l ${ctx.defineTemp(
            `add $structs, ${ctx.defineTemp(`mul ${id}, 8`, env)}`,
            env,
          )}`,
        ),
      null,
      env,
    )
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
