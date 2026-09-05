import { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
  type ArgumentChecker,
  type ASTMeta,
  type ASTNode,
  type BytecodeCompiler,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

class Eq implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Eq)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`ceql ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['any', 'any'] }
}

class Cond implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const end = new Label()

    let nextClause = new Label()

    const clauses = cell.expr.car.slice(1)
    for (const [i, clause] of clauses.entries()) {
      if (clause.expr.type !== 'cell' || clause.expr.car.length === 0) {
        throw Error(
          `compiling \`cond\`: expecting non-empty \`list\`, found \`${clause.expr.type}\``,
        )
      }

      const predicate = clause.expr.car[0]
      this.#replaceElse(predicate, this.#isLastClause(i, clauses.length))

      nextClause.fillOffset(ctx.code.len)
      nextClause = new Label()

      ctx.compileExpr(predicate, env)
      // TODO: check type

      const jumpToNextFrom = ctx.code.len
      const jumpToNext = ctx.emit(Instruction.BEqZ(0))
      nextClause.jumpFrom({
        from: jumpToNextFrom,
        fill: (offset) => jumpToNext.setInt16(1, offset, true),
      })

      const body = clause.expr.car.slice(1)
      if (body.length !== 0) {
        for (const [i, x] of body.entries()) {
          ctx.compileExpr(x, env)
          if (i !== body.length - 1) {
            ctx.emit(Instruction.Pop)
          }
        }
      } else {
        ctx.emit(Instruction.Unit)
      }

      const jumpToEndFrom = ctx.code.len
      const jumpToEnd = ctx.emit(Instruction.Jump(0))
      end.jumpFrom({
        from: jumpToEndFrom,
        fill: (offset) => jumpToEnd.setInt16(1, offset, true),
      })
    }

    nextClause.fillOffset(ctx.code.len)
    ctx.emit(Instruction.Unit)

    end.fillOffset(ctx.code.len)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeConst.unit}`)

    const end = env.defineBlock()

    let nextClause = env.defineBlock()

    const clauses = cell.expr.car.slice(1)
    for (const [i, clause] of clauses.entries()) {
      if (clause.expr.type !== 'cell' || clause.expr.car.length === 0) {
        throw Error(
          `compiling \`cond\`: expecting non-empty \`list\`, found \`${clause.expr.type}\``,
        )
      }

      const predicate = clause.expr.car[0]
      this.#replaceElse(predicate, this.#isLastClause(i, clauses.length))

      const current = nextClause
      nextClause = env.defineBlock()
      ctx.emit(current)

      const testResult = env.defineTemp()
      ctx.emit(`${testResult} =l copy ${ctx.compileExpr(predicate, env)}`)
      // TODO: check type
      ctx.emit(`${testResult} =l shr ${testResult}, 3`)

      const body = env.defineBlock()
      ctx.emit(`jnz ${testResult}, ${body}, ${nextClause}`)
      ctx.emit(body)
      ctx.emit(
        `${result} =l copy ${clause.expr.car
          .slice(1)
          .reduce((_, x) => ctx.compileExpr(x, env), qbeConst.Unit)}`,
      )
      ctx.emit(`jmp ${end}`)
    }
    ctx.emit(nextClause)

    ctx.emit(end)

    return result
  }

  #replaceElse(predicate: ASTNode, isLastClause: boolean) {
    if (predicate.expr.type === 'sym' && predicate.expr.value === 'else') {
      if (isLastClause) {
        predicate.expr = { type: 'bool', value: true }
      } else {
        error(predicate.meta, 'compiling: The `else` clause must be the last.')
      }
    }
  }

  #isLastClause(index: number, clausesLen: number) {
    return index === clausesLen - 1
  }
}

class If implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(If.#cond(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
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
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`def\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Save(env.defineVar(id.expr.value)))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`def\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }
    // Ensure that values are evaluated first, then assigned.
    const x = ctx.compileExpr(cell.expr.car[2], env)
    const slot = env.defineVar(id.expr.value)
    ctx.emitPrologue(`${slot} =l alloc8 8`)
    ctx.emitPrologue(`storel ${qbeConst.unit}, ${slot}`)
    ctx.emit(`storel ${x}, ${slot}`)
    return qbeConst.Unit
  }
}

class Loop implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const start = ctx.code.len
    for (const expr of cell.expr.car.slice(1)) {
      ctx.compileExpr(expr, env)
    }
    ctx.emit(Instruction.Jump(start - ctx.code.len))
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const loop = env.defineBlock()
    ctx.emit(loop)
    for (const expr of cell.expr.car.slice(1)) {
      ctx.compileExpr(expr, env)
    }
    ctx.emit(`jmp ${loop}`)
    ctx.emit(env.defineBlock())
    return qbeConst.Unit
  }
}

class SizeOf implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)

    const trueBranch = env.defineBlock()
    const falseBranch = env.defineBlock()
    const end = env.defineBlock()
    const result = env.defineTemp()
    ctx.emit(`jnz ${ctx.isArray(x, env)}, ${trueBranch}, ${falseBranch}`)

    ctx.emit(trueBranch)
    ctx.emit(`${result} =l mul ${ctx.arrayLen(x, env)}, 8`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(falseBranch)
    ctx.emit(`${result} =l copy 8`)

    ctx.emit(end)
    return ctx.wrapI64(result, env)
  }
}

class Call implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`call\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }

    const result = env.defineTemp()
    ctx.emit(
      `${result} =l call $${id.expr.value}(${cell.expr.car
        .slice(2)
        .map((arg) => `l ${ctx.compileExpr(arg, env)}`)
        .join(', ')})`,
    )
    return result
  }
}

class Panic implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(
    ctx: BytecodeBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ) {
    ctx.compileExpr(expr.car[1], env)

    ctx.compileExpr({ expr: { type: 'num', value: meta.column }, meta }, env)
    ctx.compileExpr({ expr: { type: 'num', value: meta.line }, meta }, env)
    ctx.compileExpr({ expr: { type: 'str', value: meta.fileName }, meta }, env)

    ctx.compileExpr({ expr: { type: 'str', value: 'panic' }, meta }, env)
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(
    ctx: QBEBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: QBEEnv,
  ) {
    const fileName = ctx.env.defineTemp()
    ctx.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

    const header = ctx.unwrapArray(ctx.compileExpr(expr.car[1], env), env)

    const size = ctx.defineTemp(`add ${header}, 8`, env)
    ctx.emit(`${size} =l loadl ${size}`)
    const newSize = ctx.defineTemp(`add ${size}, 1`, env)

    const ptr = ctx.defineTemp(`add ${header}, 16`, env)
    ctx.emit(`${ptr} =l loadl ${ptr}`)

    const message = ctx.defineTemp(`call $gc_alloc(l ${newSize})`, env)
    ctx.emit(`call $memset(l ${message}, w 0, l ${newSize})`)
    ctx.emit(`call $memcpy(l ${message}, l ${ptr}, l ${size})`)

    ctx.emit(
      `call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message})`,
    )
    return qbeConst.Unit
  }

  checkRule: CheckRule = { car: ['str'] }
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
    panic: Panic,
  },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface BytecodeBackend {
    if(pred: () => void, thenBody: () => void, elseBody?: () => void): void
    panic(meta: ASTMeta, format: string, env: BytecodeEnv): void
  }

  interface QBEBackend {
    if(
      pred: () => string,
      thenBody: () => string,
      elseBody: (() => string) | null,
      env: QBEEnv,
    ): string
    panic(meta: ASTMeta, format: string, ...args: string[]): string
  }
}

BytecodeBackend.prototype.if = function (pred, thenBody, elseBody) {
  pred()

  const elseBranch = new Label()
  const end = new Label()

  const skipThenFrom = this.code.len
  const skipThen = this.emit(Instruction.BEqZ(0))
  ;(elseBody !== undefined ? elseBranch : end).jumpFrom({
    from: skipThenFrom,
    fill: (offset) => skipThen.setInt16(1, offset, true),
  })

  thenBody()
  const jumpToEndFrom = this.code.len
  const jumpToEnd = this.emit(Instruction.Jump(0))
  end.jumpFrom({
    from: jumpToEndFrom,
    fill: (offset) => jumpToEnd.setInt16(1, offset, true),
  })

  if (elseBody !== undefined) {
    elseBranch.fillOffset(this.code.len)
    elseBody()
  }

  end.fillOffset(this.code.len)
}

BytecodeBackend.prototype.panic = function (meta, format, env) {
  this.compileExpr({ expr: { type: 'str', value: format }, meta }, env)

  this.compileExpr({ expr: { type: 'num', value: meta.column }, meta }, env)
  this.compileExpr({ expr: { type: 'num', value: meta.line }, meta }, env)
  this.compileExpr({ expr: { type: 'str', value: meta.fileName }, meta }, env)

  this.compileExpr({ expr: { type: 'str', value: 'panic' }, meta }, env)
  this.emit(Instruction.NativeCall)
}

QBEBackend.prototype.if = function (pred, thenBody, elseBody, env) {
  const thenBranch = env.defineBlock()
  const elseBranch = env.defineBlock()
  const end = env.defineBlock()
  const result = env.defineTemp()
  this.emit(
    `jnz ${pred()}, ${thenBranch}, ${elseBody !== null ? elseBranch : end}`,
  )

  this.emit(thenBranch)
  this.emit(`${result} =l copy ${thenBody()}`)
  this.emit(`jmp ${end}`)

  if (elseBody !== null) {
    this.emit(elseBranch)
    this.emit(`${result} =l copy ${elseBody()}`)
  }

  this.emit(end)
  return result
}

QBEBackend.prototype.panic = function (meta, format, ...args) {
  const fileName = this.env.defineTemp()
  this.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

  const message = this.env.defineTemp()
  this.emitGlobal(`data ${message} = { b "${format}", b 0 }`)

  this.emit(
    `call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message}, ..., ${args.join(', ')})`,
  )
  return qbeConst.Unit
}
