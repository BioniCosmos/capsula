import type { BytecodeBackend, QBEBackend, TreeWalkBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE, TreeWalk } from '@/env'
import { iter, next, type List } from '@/list'
import { car } from '@/pair'
import {
  isSymbol,
  typeOf,
  type Box,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from '@/type'
import type { Module } from '.'

class Struct implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler {
  eval(_ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)

    const id = next(it, 'struct')
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(id)}\``,
      )
    }

    const fields = it
      .map((x) => {
        if (!isSymbol(x)) {
          throw Error(
            `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(x)}\``,
          )
        }
        return x.value
      })
      .toArray()

    env.define(id.value, new StructConstructor(fields))
    for (const field of fields) {
      env.define(`${id.value}-${field}`, new TreeWalkStructGetter(field))
    }
  }

  compile(_ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    const it = iter(exprs)

    const id = next(it, 'struct')
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(id)}\``,
      )
    }

    const fields = it
      .map((x) => {
        if (!isSymbol(x)) {
          throw Error(
            `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(x)}\``,
          )
        }
        return x.value
      })
      .toArray()

    env.defineVarUnit(id.value, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id.value}-${field}`, new BytecodeStructGetter(i))
    }
  }

  compileToQBE(_ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const it = iter(exprs)

    const id = next(it, 'struct')
    if (!isSymbol(id)) {
      throw Error(
        `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(id)}\``,
      )
    }

    const fields = it
      .map((x) => {
        if (!isSymbol(x)) {
          throw Error(
            `evaluating \`struct\`: expecting \`symbol\`, found \`${typeOf(x)}\``,
          )
        }
        return x.value
      })
      .toArray()

    env.defineVarUnit(id.value, new StructConstructor(fields))
    for (const [i, field] of fields.entries()) {
      env.defineVarUnit(`${id.value}-${field}`, new QBEStructGetter(i))
    }

    return null
  }
}

class StructConstructor
  implements TreeWalkEvaluator, BytecodeCompiler, QBECompiler
{
  constructor(private fields: string[]) {}

  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const it = iter(exprs)
    const struct = new TreeWalkStructVal()
    for (const field of this.fields) {
      struct.val.set(
        field,
        await ctx.evaluate(next(it, 'struct-constructor') as SExpr, env),
      )
    }
    return struct
  }

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    // TODO: check argument count
    for (const expr of iter(exprs).toArray().toReversed()) {
      ctx.compileExpr(expr as SExpr, env)
    }
    ctx.emit(Instruction.ArrayNew(this.fields.length))
  }

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const structHeader = (ctx.env.lookup('array') as QBECompiler).compileToQBE(
      ctx,
      exprs,
      env,
    )
    // structHeader.type = 1
    ctx.emit(`storel 1, ${ctx.unwrapArray(structHeader!, env)}`)
    return structHeader
  }
}

class TreeWalkStructVal implements Box {
  type = 'struct'
  val = new Map<string, Var>()
}

class TreeWalkStructGetter implements TreeWalkEvaluator {
  constructor(private field: string) {}

  async eval(ctx: TreeWalkBackend, exprs: List, env: TreeWalk.Env) {
    const struct = await ctx.evaluate(car(exprs) as SExpr, env)
    if (!(struct instanceof TreeWalkStructVal)) {
      throw Error(
        `evaluating \`struct-getter\`: expecting \`TreeWalkStructVal\`, found \`${typeOf(struct)}\``,
      )
    }
    return struct.val.get(this.field)
  }
}

class BytecodeStructGetter implements BytecodeCompiler {
  constructor(private offset: number) {}

  compile(ctx: BytecodeBackend, exprs: List, env: Bytecode.Env) {
    ctx.compileExpr(car(exprs) as SExpr, env)
    ctx.emit(Instruction.ArrayGet(this.offset))
  }
}

class QBEStructGetter implements QBECompiler {
  constructor(private offset: number) {}

  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const header = ctx.unwrapArray(
      ctx.compileExpr(car(exprs) as SExpr, env)!,
      env,
    )
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
