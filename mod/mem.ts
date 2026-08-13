import type { QBEBackend } from '@/backend'
import type { QBEEnv } from '@/env'
import {
  qbeConst,
  type ASTNode,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import type { Module } from '.'

class Alloc implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)!
    ctx.emit(`call $gc_retain(l ${x})`)

    const result = env.defineTemp()

    const scalarBranch = env.defineBlock()
    const arrayBranch = env.defineBlock()
    const end = env.defineBlock()
    ctx.emit(`jnz ${ctx.isArray(x, env)}, ${arrayBranch}, ${scalarBranch}`)

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

    const ptr = ctx.defineTemp(`add ${result}, 8`, env)
    const dataSize = ctx.defineTemp(`loadl ${ptr}`, env)
    ctx.emit(`${dataSize} =l mul ${dataSize}, 8`)

    const newData = env.defineTemp()
    ctx.emit(`${newData} =l call $gc_alloc(l ${dataSize})`)
    ctx.emit(`${ptr} =l add ${result}, 16`)
    const oldData = env.defineTemp()
    ctx.emit(`${oldData} =l loadl ${ptr}`)
    ctx.emit(`call $memcpy(l ${newData}, l ${oldData}, l ${dataSize})`)
    ctx.emit(`storel ${newData}, ${ptr}`)
    ctx.emit(`${result} =l or ${result}, ${qbeConst.array}`)
    ctx.emit(`jmp ${end}`)

    ctx.emit(end)
    ctx.emit(`call $gc_release(l ${x})`)
    return result
  }
}

class Free implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)

    const scalarBranch = env.defineBlock()
    const arrayBranch = env.defineBlock()
    const end = env.defineBlock()
    ctx.emit(`jnz ${ctx.isArray(x, env)}, ${arrayBranch}, ${scalarBranch}`)

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
    return qbeConst.Unit
  }
}

export default {
  name: 'mem',
  dependencies: [],
  units: { alloc: Alloc, free: Free },
  prelude: '',
} satisfies Module
