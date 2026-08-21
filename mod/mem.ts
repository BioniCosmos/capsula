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

    const result = ctx.if(
      () => ctx.isArray(x, env),
      () => {
        const result = ctx.defineTemp(`alloc8 24`, env)
        ctx.emit(`blit ${ctx.unwrapArray(x, env)}, ${result}, 24`)

        const type = env.defineTemp()
        ctx.emit(`${type} =l loadl ${result}`)
        ctx.emit(`${type} =l or ${type}, ${1n << 63n}`)
        ctx.emit(`storel ${type}, ${result}`)

        const dataSize = ctx.defineTemp(
          `mul ${ctx.arrayLen(result, env)}, 8`,
          env,
        )
        const newData = ctx.defineTemp(`$gc_alloc(l ${dataSize})`, env)
        const ptrField = ctx.defineTemp(`add ${result}, 16`, env)
        const oldData = ctx.defineTemp(`loadl ${ptrField}`, env)
        ctx.emit(`call $memcpy(l ${newData}, l ${oldData}, l ${dataSize})`)
        ctx.emit(`storel ${newData}, ${ptrField}`)
        return ctx.wrapArray(result, env)
      },
      () => {
        const result = ctx.defineTemp(`call $gc_alloc(l 8)`, env)
        ctx.emit(`storel ${x}, ${result}`)
        return result
      },
      env,
    )

    ctx.emit(`call $gc_release(l ${x})`)
    return result
  }
}

class Free implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)
    return ctx.if(
      () => ctx.isArray(x, env),
      () => {
        const p = env.defineTemp()
        ctx.emit(`${p} =l add ${ctx.unwrapArray(x, env)}, 16`)
        ctx.emit(`${p} =l loadl ${p}`)
        ctx.emit(`call $free(l ${p})`)
        return qbeConst.Unit
      },
      () => {
        ctx.emit(`call $free(l ${x})`)
        return qbeConst.Unit
      },
      env,
    )
  }
}

export default {
  name: 'mem',
  dependencies: [],
  units: { alloc: Alloc, free: Free },
  prelude: '',
} satisfies Module
