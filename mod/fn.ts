import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import { BytecodeEnv, QBEEnv } from '@/env'
import {
  consWith,
  qbeConst,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
  type SExprSym,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

export class BytecodeFn implements BytecodeCompiler {
  constructor(
    public idx: number,
    private requiredLen: number,
    private hasRest: boolean,
  ) {}

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const { sym, consCAR } = consWith(cell.meta)
    const args = cell.expr.car.slice(1)

    if (args.length < this.requiredLen) {
      error(
        cell.expr.car[0].meta,
        `compiling: The function expects ${this.hasRest ? 'at least ' : ''}${this.requiredLen} arguments, but found ${args.length}.`,
      )
    }
    if (!this.hasRest && args.length > this.requiredLen) {
      error(
        args[this.requiredLen].meta,
        `compiling: The function expects exactly ${this.requiredLen} arguments, but found ${args.length}.`,
      )
    }

    if (this.hasRest) {
      ctx.compileExpr(
        consCAR([sym('array'), ...args.slice(this.requiredLen)]),
        env,
      )
    }
    for (let i = this.requiredLen - 1; i >= 0; i--) {
      ctx.compileExpr(args[i], env)
    }
    ctx.emit(Instruction.Call(this.idx))
  }
}

export class QBEFn implements QBECompiler {
  constructor(
    public id: string,
    private requiredLen: number,
    private hasRest: boolean,
  ) {}

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const args = ctx.compileArgs(cell, env)

    if (args.length < this.requiredLen) {
      error(
        cell.expr.car[0].meta,
        `compiling: The function expects ${this.hasRest ? 'at least ' : ''}${this.requiredLen} arguments, but found ${args.length}.`,
      )
    }
    if (!this.hasRest && args.length > this.requiredLen) {
      error(
        cell.expr.car[1 + this.requiredLen].meta,
        `compiling: The function expects exactly ${this.requiredLen} arguments, but found ${args.length}.`,
      )
    }

    const rest = this.hasRest
      ? ctx.compileExpr(
          {
            expr: {
              type: 'cell',
              car: [
                { expr: { type: 'sym', value: 'array' }, meta: cell.meta },
                // (fn a b c d e f)
                //          [     ]
                //  1 ( len )
                ...cell.expr.car.slice(1 + this.requiredLen),
              ],
              cdr: null,
            },
            meta: cell.meta,
          },
          env,
        )
      : null

    return ctx.defineTemp(
      `call ${this.id}(${args
        .slice(0, this.requiredLen)
        .concat(rest !== null ? [rest] : [])
        .map((x) => `l ${x}`)
        .join(', ')})`,
      env,
    )
  }
}

// TODO: support optional/default and named parameters
class Defn implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`defn\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }

    const params = cell.expr.car[2]
    if (params.expr.type !== 'cell') {
      throw Error(
        `compiling \`defn\`: expecting \`cell\`, found \`${params.expr.type}\``,
      )
    }
    const { car, cdr } = params.expr
    // Ensure all required parameters are symbol.
    Defn.#assertAllSymbols(car)
    // Ensure the rest parameter is a symbol.
    Defn.#assertSymbol(cdr)

    const fn = new BytecodeFn(ctx.startFn(), car.length, cdr !== null)
    env.defineVarUnit(id.expr.value, fn)

    const fnEnv = new BytecodeEnv(env, true)
    for (const param of car) {
      ctx.emit(Instruction.Save(fnEnv.defineVar(param.expr.value)))
    }
    if (cdr !== null) {
      ctx.emit(Instruction.Save(fnEnv.defineVar(cdr.expr.value)))
    }

    for (const expr of cell.expr.car.slice(3)) {
      ctx.compileExpr(expr, fnEnv)
    }
    ctx.emit(Instruction.Ret)

    ctx.endFn(fnEnv.sp!)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`defn\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }

    const params = cell.expr.car[2]
    if (params.expr.type !== 'cell') {
      throw Error(
        `compiling \`defn\`: expecting \`cell\`, found \`${params.expr.type}\``,
      )
    }
    const { car, cdr } = params.expr
    // Ensure all required parameters are symbol.
    Defn.#assertAllSymbols(car)
    // Ensure the rest parameter is a symbol.
    Defn.#assertSymbol(cdr)

    const fn = new QBEFn(ctx.env.genId('v'), car.length, cdr !== null)
    env.defineVarUnit(id.expr.value, fn)

    const fnEnv = new QBEEnv(env, true)
    const paramDef: string[] = []
    const prologue: string[] = []
    for (const param of car) {
      const origin = fnEnv.defineTemp()
      const slot = fnEnv.defineVar(param.expr.value)
      paramDef.push(`l ${origin}`)
      prologue.push(`${slot} =l alloc8 8`)
      prologue.push(`storel ${origin}, ${slot}`)
    }
    if (cdr !== null) {
      const origin = fnEnv.defineTemp()
      const slot = fnEnv.defineVar(cdr.expr.value)
      paramDef.push(`l ${origin}`)
      prologue.push(`${slot} =l alloc8 8`)
      prologue.push(`storel ${origin}, ${slot}`)
    }

    ctx.startFn(fn.id, paramDef.join(', '))
    for (const line of prologue) {
      ctx.emitPrologue(line)
    }

    let result = qbeConst.Unit
    for (const expr of cell.expr.car.slice(3)) {
      result = ctx.compileExpr(expr, fnEnv)
    }

    const { slots } = fnEnv
    ctx.emitPrologue(`%frame =l alloc8 ${8 + 8 + 8 * slots.length}`)
    ctx.emitPrologue(`call $frame_push(l %frame, l ${slots.length})`)
    for (const [i, ptr] of slots.entries()) {
      ctx.emitPrologue(`call $frame_slot_push(l ${i}, l ${ptr})`)
    }
    ctx.emit('call $frame_pop()')

    ctx.endFn(result)
    return qbeConst.Unit
  }

  static #assertAllSymbols(xs: ASTNode[]): asserts xs is ASTNode<SExprSym>[] {
    for (const x of xs) {
      if (x.expr.type !== 'sym') {
        throw Error(
          `compiling \`defn\`: expecting \`symbol\`, found \`${x.expr.type}\``,
        )
      }
    }
  }

  static #assertSymbol(
    x: ASTNode | null,
  ): asserts x is null | ASTNode<SExprSym> {
    if (x !== null && x.expr.type !== 'sym') {
      throw Error(
        `compiling \`defn\`: expecting \`symbol\`, found \`${x.expr.type}\``,
      )
    }
  }
}

export default {
  name: 'fn',
  dependencies: [],
  units: { defn: Defn },
  prelude: '',
} satisfies Module
