import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

class Struct implements BytecodeCompiler, QBECompiler {
  compile(_ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const [id, fields] = Struct.#checkArgs(cell)
    env.defineVarUnit(id, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id}-${field}`, new BytecodeStructGetter(i))
    }
  }

  compileToQBE(_ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [id, fields] = Struct.#checkArgs(cell)
    env.defineVarUnit(id, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id}-${field}`, new QBEStructGetter(i))
    }
    return qbeConst.Unit
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
  constructor(private fields: string[]) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    // TODO: check argument count
    for (const expr of cell.expr.car.slice(1).toReversed()) {
      ctx.compileExpr(expr, env)
    }
    ctx.emit(Instruction.ArrayNew(this.fields.length))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const structHeader = (ctx.env.lookup('array') as QBECompiler).compileToQBE(
      ctx,
      cell,
      env,
    )
    // structHeader.type = 1
    ctx.emit(`storel 1, ${ctx.unwrapArray(structHeader, env)}`)
    return structHeader
  }
}

class BytecodeStructGetter implements BytecodeCompiler {
  constructor(private offset: number) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.ArrayGet(this.offset))
  }
}

class QBEStructGetter implements QBECompiler {
  constructor(private offset: number) {}

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const header = ctx.unwrapArray(ctx.compileExpr(cell.expr.car[1], env), env)
    // TODO: check type
    const p = env.defineTemp()
    // p = header.ptr.*
    ctx.emit(`${p} =l add ${header}, 16`)
    ctx.emit(`${p} =l loadl ${p}`)
    // p = p[offset].*
    ctx.emit(`${p} =l add ${p}, ${8 * this.offset}`)
    ctx.emit(`${p} =l loadl ${p}`)
    return p
  }
}

export default {
  name: 'struct',
  dependencies: ['array'],
  units: { struct: Struct },
  prelude: '',
} satisfies Module
