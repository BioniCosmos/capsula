import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import type { Bytecode, QBE } from '@/env'
import {
  qbeUnit,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import type { Module } from '.'

class Eq implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Eq)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(`${result} =l ceql ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

// TODO: support `else`
// TODO: Consider returning other type when all clauses are false.
class Cond implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    const end = new Label()

    let nextClause = new Label()
    for (const clause of cell.expr.car.slice(1)) {
      if (clause.expr.type !== 'cell' || clause.expr.car.length === 0) {
        throw Error(
          `compiling \`cond\`: expecting non-empty \`list\`, found \`${clause.expr.type}\``,
        )
      }

      nextClause.fillOffset(ctx.code.len)
      nextClause = new Label()

      ctx.compileExpr(clause.expr.car[0], env)
      // TODO: check type

      const jumpToNextFrom = ctx.code.len
      const jumpToNext = ctx.emit(Instruction.BEqZ(0))
      nextClause.jumpFrom({
        from: jumpToNextFrom,
        fill: (offset) => jumpToNext.setInt16(1, offset, true),
      })
      for (const x of clause.expr.car.slice(1)) {
        ctx.compileExpr(x, env)
      }

      const jumpToEndFrom = ctx.code.len
      const jumpToEnd = ctx.emit(Instruction.Jump(0))
      end.jumpFrom({
        from: jumpToEndFrom,
        fill: (offset) => jumpToEnd.setInt16(1, offset, true),
      })
    }
    nextClause.fillOffset(ctx.code.len)

    end.fillOffset(ctx.code.len)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeUnit}`)

    const end = env.defineBlock()

    let nextClause = env.defineBlock()
    for (const clause of cell.expr.car.slice(1)) {
      if (clause.expr.type !== 'cell' || clause.expr.car.length === 0) {
        throw Error(
          `compiling \`cond\`: expecting non-empty \`list\`, found \`${clause.expr.type}\``,
        )
      }

      const current = nextClause
      nextClause = env.defineBlock()
      ctx.emit(current)

      const condition = env.defineTemp()
      ctx.emit(
        `${condition} =l copy ${ctx.compileExpr(clause.expr.car[0], env)}`,
      )
      // TODO: check type
      ctx.emit(`${condition} =l shr ${condition}, 3`)

      const body = env.defineBlock()
      ctx.emit(`jnz ${condition}, ${body}, ${nextClause}`)
      ctx.emit(body)
      ctx.emit(
        `${result} =l copy ${clause.expr.car
          .slice(1)
          .reduce((_, x) => ctx.compileExpr(x, env), qbeUnit)}`,
      )
      ctx.emit(`jmp ${end}`)
    }
    ctx.emit(nextClause)

    ctx.emit(end)

    return result
  }
}

class If implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(If.#cond(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    return ctx.compileExpr(If.#cond(cell), env)
  }

  static #cond({ expr, meta }: ASTNode<SExprCell>): ASTNode<SExprCell> {
    return {
      expr: {
        type: 'cell',
        car: [
          { expr: { type: 'sym', value: 'cond' }, meta: expr.car[0].meta },
          {
            expr: { type: 'cell', car: [expr.car[1], expr.car[2]], cdr: null },
            meta,
          },
          {
            expr: {
              type: 'cell',
              car: [{ expr: { type: 'bool', value: true }, meta }, expr.car[3]],
              cdr: null,
            },
            meta,
          },
        ],
        cdr: null,
      },
      meta,
    }
  }
}

class Def implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`def\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Save(env.defineVar(id.expr.value)))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`def\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }
    // Ensure that values are evaluated first, then assigned.
    const x = ctx.compileExpr(cell.expr.car[2], env)
    const slot = env.defineSlot(id.expr.value)
    ctx.emitPrologue(`${slot} =l alloc8 8`)
    ctx.emitPrologue(`storel ${qbeUnit}, ${slot}`)
    ctx.emit(`storel ${x}, ${slot}`)
    return qbeUnit
  }
}

class Loop implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    const start = ctx.code.len
    for (const expr of cell.expr.car.slice(1)) {
      ctx.compileExpr(expr, env)
    }
    ctx.emit(Instruction.Jump(start - ctx.code.len))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const loop = env.defineBlock()
    ctx.emit(loop)
    for (const expr of cell.expr.car.slice(1)) {
      ctx.compileExpr(expr, env)
    }
    ctx.emit(`jmp ${loop}`)
    ctx.emit(env.defineBlock())
    return qbeUnit
  }
}

class SizeOf implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const x = ctx.compileExpr(cell.expr.car[1], env)

    const tag = env.defineVar('tag')
    ctx.emit(`${tag} =l copy ${ctx.tag(x, env)}`)
    const arrayTag = env.defineVar('array_tag')
    ctx.emit(`${arrayTag} =l copy ${0b011}`)
    // len := x.len
    const len = env.defineVar('len')
    ctx.emit(`${len} =l copy ${ctx.unwrapArray(x, env)}`)
    ctx.emit(`${len} =l add ${len}, 8`)
    ctx.emit(`${len} =l loadl ${len}`)
    ctx.emit(`${len} =l copy ${ctx.wrapI64(len, env)}`)

    return ctx.capl('(if (= tag array_tag) len 8)', env)
  }
}

class Call implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`call\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }

    const result = env.defineTemp()
    ctx.emit(
      `${result} =l call $${id}(${cell.expr.car
        .slice(2)
        .map((arg) => `l ${ctx.compileExpr(arg, env)}`)
        .join(', ')})`,
    )
    return result
  }
}

export default {
  name: 'core',
  dependencies: [],
  units: {
    '=': Eq,
    cond: Cond,
    if: If,
    def: Def,
    loop: Loop,
    'size-of': SizeOf,
    call: Call,
  },
  prelude: '',
} satisfies Module
