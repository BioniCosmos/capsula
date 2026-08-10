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
import type { Module } from '.'

class Struct implements BytecodeCompiler, QBECompiler {
  compile(_ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`struct\`: expecting \`symbol\`, found \`${id.expr.type}\``,
      )
    }

    const fields = cell.expr.car.slice(2).map((x) => {
      if (x.expr.type !== 'sym') {
        throw Error(
          `compiling \`struct\`: expecting \`symbol\`, found \`${x.expr.type}\``,
        )
      }
      return x.expr.value
    })

    env.defineVarUnit(id.expr.value, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(
        `${id.expr.value}-${field}`,
        new BytecodeStructGetter(i),
      )
    }
  }

  compileToQBE(_ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`struct\`: expecting \`symbol\`, found \`${id.expr.type}\``,
      )
    }

    const fields = cell.expr.car.slice(2).map((x) => {
      if (x.expr.type !== 'sym') {
        throw Error(
          `compiling \`struct\`: expecting \`symbol\`, found \`${x.expr.type}\``,
        )
      }
      return x.expr.value
    })

    env.defineVarUnit(id.expr.value, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id.expr.value}-${field}`, new QBEStructGetter(i))
    }

    return qbeConst.Unit
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
