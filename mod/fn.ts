import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
  type SExprSym,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

// TODO: support rest parameters
export class BytecodeFn implements BytecodeCompiler {
  constructor(
    public idx: number,
    public env: BytecodeEnv,
    public required: ASTNode<SExprSym>[],
  ) {
    for (const param of required) {
      env.defineVar(param.expr.value)
    }
  }

  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    for (let i = 0; i < this.required.length; i++) {
      ctx.compileExpr(cell.expr.car[i + 1], env)
    }
    ctx.emit(Instruction.Call(this.idx))
  }
}

// TODO:
//   1. Consider remove `required` and `rest`.
//   2. Rest parameters are not tested on all backends because of the lack of cons cell list. The array should be
//      replaced by list.
export class QBEFn implements QBECompiler {
  constructor(
    public id: string,
    private requiredLen: number,
    // public env: QBEEnv,
    // private required: ASTNode<SExprSym>[],
    // private rest: ASTNode<SExprSym> | null,
  ) {
    // for (const param of required) {
    //   env.defineVar(param.expr.value)
    // }
    // if (rest) {
    //   env.defineVar(rest.expr.value)
    // }
  }

  // get params() {
  //   return this.required
  //     .concat(this.rest ? [this.rest] : [])
  //     .map((x) => `l ${this.env.lookup(x.expr.value)}`)
  //     .join(', ')
  // }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const args = ctx.compileArgs(cell, env)

    if (args.length !== this.requiredLen) {
      error(
        cell.expr.car[0].meta,
        `compiling: The function requires ${this.requiredLen} arguments, found ${args.length}.`,
      )
    }

    // TODO: redesign
    // let rest: string | null = null
    // if (this.rest) {
    //   rest = ctx.compileExpr(
    //     {
    //       expr: {
    //         type: 'cell',
    //         car: [
    //           { expr: { type: 'sym', value: 'array' }, meta: cell.meta },
    //           ...cell.expr.car.slice(1 + this.required.length),
    //         ],
    //         cdr: null,
    //       },
    //       meta: cell.meta,
    //     },
    //     env,
    //   )
    // }

    const result = env.defineTemp()
    ctx.emit(
      `${result} =l call ${this.id}(${args
        // .slice(0, this.required.length)
        // .concat(rest !== null ? [rest] : [])
        .map((x) => `l ${x}`)
        .join(', ')})`,
    )
    return result
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
    if (cdr !== null && cdr.expr.type !== 'sym') {
      throw Error(
        `compiling \`defn\`: expecting \`symbol\`, found \`${cdr.expr.type}\``,
      )
    }

    const fn = new BytecodeFn(ctx.startFn(), new BytecodeEnv(env), car)
    env.defineVarUnit(id.expr.value, fn)

    for (const param of fn.required.toReversed()) {
      ctx.emit(Instruction.Save(fn.env.lookup(param.expr.value) as number))
    }
    for (const expr of cell.expr.car.slice(3)) {
      ctx.compileExpr(expr, fn.env)
    }
    ctx.emit(Instruction.Ret)

    ctx.endFn(fn.env.localCount)
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
    if (cdr !== null && cdr.expr.type !== 'sym') {
      throw Error(
        `compiling \`defn\`: expecting \`symbol\`, found \`${cdr.expr.type}\``,
      )
    }

    const fn = new QBEFn(
      ctx.env.genId('v'),
      car.length,
      // new QBEEnv(env),
      // car,
      // cdr as ASTNode<SExprSym> | null,
    )
    env.defineVarUnit(id.expr.value, fn)

    const fnEnv = new QBEEnv(env)
    const paramDef: string[] = []
    const prologue: string[] = []
    for (const param of car) {
      const origin = fnEnv.defineTemp()
      const slot = fnEnv.defineVar(param.expr.value)
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
}

export default {
  name: 'fn',
  dependencies: [],
  units: { defn: Defn },
  prelude: '',
} satisfies Module
