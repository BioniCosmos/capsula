import type { QBEBackend } from '@/backend'
import type { QBEEnv } from '@/env'
import { qbeUnit, type ASTNode, type QBECompiler, type SExprCell } from '@/type'
import type { Module } from '.'

class Alloc implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)!
    ctx.emit(`call $gc_retain(l ${x})`)

    const isArray = env.defineTemp()
    ctx.emit(`${isArray} =l ceql ${ctx.tag(x, env)}, ${0b011}`)
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeUnit}`)

    const scalarBranch = env.defineBlock()
    const arrayBranch = env.defineBlock()
    const end = env.defineBlock()
    ctx.emit(`jnz ${isArray}, ${arrayBranch}, ${scalarBranch}`)

    ctx.emit(scalarBranch)
    ctx.emit(`${result} =l call $gc_alloc(l 8)`)
    ctx.emit(`storel ${x}, ${result}`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(arrayBranch)
    ctx.emit(`${result} =l alloc8 24`)
    ctx.emit(`blit ${ctx.unwrapArray(x, env)}, ${result}, 24`)

    const type = env.defineTemp()
    ctx.emit(`${type} =l loadl ${result}`)
    ctx.emit(`${type} =l or ${type}, ${1n << 63n}`)
    ctx.emit(`storel ${type}, ${result}`)

    const dataSize = env.defineTemp()
    ctx.emit(
      `${dataSize} =l mul ${ctx.unwrapI64(
        (ctx.env.lookup('size-of') as QBECompiler).compileToQBE(ctx, cell, env),
        env,
      )}, 8`,
    )
    const newData = env.defineTemp()
    ctx.emit(`${newData} =l call $gc_alloc(l ${dataSize})`)
    const ptr = env.defineTemp()
    ctx.emit(`${ptr} =l add ${result}, 16`)
    const oldData = env.defineTemp()
    ctx.emit(`${oldData} =l loadl ${ptr}`)
    ctx.emit(`call $memcpy(l ${newData}, l ${oldData}, l ${dataSize})`)
    ctx.emit(`storel ${newData}, ${ptr}`)
    ctx.emit(`${result} =l or ${result}, ${0b011}`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(end)
    ctx.emit(`call $gc_release(l ${x})`)
    return result
  }
}

class Free implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)

    const isArray = env.defineTemp()
    ctx.emit(`${isArray} =l ceql ${ctx.tag(x, env)}, ${0b011}`)

    const scalarBranch = env.defineBlock()
    const arrayBranch = env.defineBlock()
    const end = env.defineBlock()
    ctx.emit(`jnz ${isArray}, ${arrayBranch}, ${scalarBranch}`)

    ctx.emit(scalarBranch)
    ctx.emit(`call $free(l ${x})`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(arrayBranch)
    const ptr = env.defineTemp()
    ctx.emit(`${ptr} =l add ${ctx.unwrapArray(x, env)}, 16`)
    ctx.emit(`${ptr} =l loadl ${ptr}`)
    ctx.emit(`call $free(l ${ptr})`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(end)
    return qbeUnit
  }
}

export default {
  name: 'mem',
  dependencies: ['core'],
  units: { alloc: Alloc, free: Free },
  prelude: '',
} satisfies Module
