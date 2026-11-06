import type { Backend, BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, Environment, QBEEnv } from '@/env'
import {
  type ASTNode,
  CallSite,
  num,
  type Params,
  qbeBox,
  qbeSegment,
  type SExprCell,
  str,
  Unit,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

class Struct extends Unit {
  override lazy = true
  override isStatement = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, _args: number[]) {
    Struct.#compileTo(ctx, site.cell, env)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, _args: string[]) {
    Struct.#compileTo(ctx, site.cell, env)
    return ''
  }

  static #compileTo(ctx: Backend, cell: ASTNode<SExprCell>, env: Environment) {
    const id = ctx.env.struct.idCounter++
    const [name, fields] = Struct.#checkArgs(cell)
    env.defineVarUnit(name, new StructConstructor(id, fields.length))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${name}-${field}`, new StructGetter(id, i))
    }
    ctx.env.struct.meta.push({ name, fields })
  }

  static #checkArgs({ expr }: ASTNode<SExprCell>): [string, string[]] {
    const id = expr.car[1]
    if (id.expr.type !== 'sym') {
      error(
        id.meta,
        `compiling: The name of the struct must be a symbol, but got \`${id.expr.type === 'num' ? 'i64' : id.expr.type}\`.`,
      )
    }
    const fields: string[] = []
    for (const field of expr.car.slice(2)) {
      if (field.expr.type !== 'sym') {
        error(
          field.meta,
          `compiling: Every field name of the struct must be a symbol, but got \`${field.expr.type === 'num' ? 'i64' : field.expr.type}\`.`,
        )
      }
      fields.push(field.expr.value)
    }
    return [id.expr.value, fields]
  }
}

class StructConstructor extends Unit {
  constructor(
    private id: number,
    private fieldCount: number,
  ) {
    super()
  }

  override params: Params = { car: [], cdr: true }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { cell }: CallSite, args: number[]) {
    this.#checkArgs(ctx, cell)

    for (const arg of args.toReversed()) {
      ctx.emit(Instruction.Load(arg))
    }
    ctx.compileExpr(num(this.fieldCount), env)
    ctx.compileExpr(num(this.id), env)
    ctx.compileExpr(str('struct'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { cell }: CallSite, args: string[]) {
    this.#checkArgs(ctx, cell)

    const struct = ctx.defineTemp(`alloc8 ${16 + args.length * 8}`, env)
    const p = ctx.defineTemp(`copy ${struct}`, env)
    // struct.type = .struct
    ctx.emit(`storeh ${qbeBox.struct}, ${p}`)
    // struct.segment = .stack
    ctx.emit(`${p} =l add ${p}, 2`)
    ctx.emit(`storeh ${qbeSegment.stack}, ${p}`)
    // struct.id = id
    ctx.emit(`${p} =l add ${p}, 2`)
    ctx.emit(`storew ${this.id}, ${p}`)
    // struct.len = xs.len
    ctx.emit(`${p} =l add ${p}, 4`)
    ctx.emit(`storel ${args.length}, ${p}`)
    // struct.data <- xs
    for (const x of args) {
      // struct.data[i] = x
      ctx.emit(`${p} =l add ${p}, ${8}`)
      ctx.emit(`storel ${x}, ${p}`)
    }
    return struct
  }

  #checkArgs(ctx: Backend, { expr, meta }: ASTNode<SExprCell>) {
    const argCount = expr.car.length - 1
    if (argCount !== this.fieldCount) {
      error(
        meta,
        `compiling: Struct \`${ctx.env.struct.meta[this.id].name}\` expects ${this.fieldCount} field(s), but ${argCount} were given.`,
      )
    }
  }
}

class StructGetter extends Unit {
  constructor(
    private id: number,
    private offset: number,
  ) {
    super()
  }

  override params: Params = { car: ['struct'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.compileExpr(num(this.offset), env)
    ctx.emit(Instruction.Load(args[0]))
    ctx.compileExpr(str('array-at'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, args: string[]) {
    const id = ctx.defineTemp(`loaduw ${ctx.defineTemp(`add ${args[0]}, 4`, env)}`, env)
    ctx.if(
      () => `cnel ${id}, ${this.id}`,
      () => {
        const expect = ctx.defineTemp(
          `loadl ${ctx.defineTemp(
            `loadl ${ctx.defineTemp(`add $structs, ${this.id * 8}`, env)}`,
            env,
          )}`,
          env,
        )
        const actual = ctx.defineTemp(
          `loadl ${ctx.defineTemp(
            `loadl ${ctx.defineTemp(`add $structs, ${ctx.defineTemp(`mul ${id}, 8`, env)}`, env)}`,
            env,
          )}`,
          env,
        )
        ctx.panic(
          site.operands[0].meta,
          'expecting a value of struct `%s`, but got a value of struct `%s`',
          `l ${expect}`,
          `l ${actual}`,
        )
      },
      { env },
    )
    return ctx.defineTemp(
      `loadl ${ctx.defineTemp(`add ${args[0]}, ${16 + 8 * this.offset}`, env)}`,
      env,
    )
  }
}

export default {
  name: 'struct',
  dependencies: [],
  units: { struct: Struct },
  prelude: '',
} satisfies Module
