import type { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { Bytecode, QBE } from '@/env'
import { iter, next, type List } from '@/list'
import { car } from '@/pair'
import type { BytecodeCompiler, QBECompiler, SExpr } from '@/type'
import type { Module } from '.'

class Struct implements BytecodeCompiler, QBECompiler {
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

class StructConstructor implements BytecodeCompiler, QBECompiler {
  constructor(private fields: string[]) {}

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
