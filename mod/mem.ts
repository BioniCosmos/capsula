import type { QBEBackend } from '@/backend'
import type { QBE } from '@/env'
import type { List } from '@/list'
import { car } from '@/pair'
import { qbeUnit, type QBECompiler, type SExpr } from '@/type'
import type { Module } from '.'

class Alloc implements QBECompiler {
  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const x = ctx.compileExpr(car(exprs) as SExpr, env)!

    const isArray = env.defineTemp()
    ctx.emit(`${isArray} =l ceql ${ctx.tag(x, env)}, ${0b011}`)
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeUnit}`)

    const scalarBranch = env.defineBlock()
    const arrayBranch = env.defineBlock()
    const end = env.defineBlock()
    ctx.emit(`jnz ${isArray}, ${arrayBranch}, ${scalarBranch}`)

    ctx.emit(scalarBranch)
    ctx.emit(`${result} =l call $malloc(l 8)`)
    ctx.emit(`storel ${x}, ${result}`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(arrayBranch)
    ctx.emit(`${result} =l call $malloc(l 24)`)
    ctx.emit(`blit ${ctx.unwrapArray(x, env)}, ${result}, 24`)

    const dataSize = env.defineTemp()
    ctx.emit(
      `${dataSize} =l mul ${ctx.unwrapI64(
        (ctx.env.lookup('size-of') as QBECompiler).compileToQBE(
          ctx,
          exprs,
          env,
        )!,
        env,
      )}, 8`,
    )
    const newData = env.defineTemp()
    ctx.emit(`${newData} =l call $malloc(l ${dataSize})`)
    const ptr = env.defineTemp()
    ctx.emit(`${ptr} =l add ${result}, 16`)
    const oldData = env.defineTemp()
    ctx.emit(`${oldData} =l loadl ${ptr}`)
    ctx.emit(`call $memcpy(l ${newData}, l ${oldData}, l ${dataSize})`)
    ctx.emit(`storel ${newData}, ${ptr}`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(end)
    return result
  }
}

class Free implements QBECompiler {
  compileToQBE(ctx: QBEBackend, exprs: List, env: QBE.Env) {
    const x = ctx.compileExpr(car(exprs) as SExpr, env)!
    const header = ctx.unwrapArray(x, env)
    const ptr = env.defineTemp()
    ctx.emit(`${ptr} =l add ${header}, 16`)
    ctx.emit(`${ptr} =l loadl ${ptr}`)
    ctx.emit(`call $free(l ${ptr})`)
    ctx.emit(`call $free(l ${header})`)
    return null
  }
}

export default {
  name: 'mem',
  dependencies: ['core'],
  units: { alloc: Alloc, free: Free },
  prelude: '',
} satisfies Module
