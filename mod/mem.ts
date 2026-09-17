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
        const arr = ctx.unwrapArray(x, env)
        const header = ctx.defineTemp(`alloc8 24`, env)
        const p = ctx.defineTemp(`copy ${header}`, env)

        // Convert and copy `type`.
        const type = env.defineTemp()
        ctx.emit(`${type} =l loadl ${arr}`)
        ctx.emit(`${type} =l or ${type}, ${1n << 63n}`)
        ctx.emit(`storel ${type}, ${p}`)

        // Copy `len`.
        ctx.emit(`${arr} =l add ${arr}, 8`)
        ctx.emit(`${p} =l add ${p}, 8`)
        ctx.emit(`blit ${arr}, ${p}, 8`)

        // Calculate `size`.
        const size = env.defineTemp()
        ctx.emit(`${size} =l loadl ${arr}`)
        ctx.emit(`${size} =l mul ${size}, 8`)

        // Allocate and copy data.
        ctx.emit(`${arr} =l add ${arr}, 8`)
        ctx.emit(`${p} =l add ${p}, 8`)
        const ptr = ctx.defineTemp(`call $gc_alloc(l ${size})`, env)
        ctx.emit(`call $memcpy(l ${ptr}, l ${arr}, l ${size})`)
        ctx.emit(`storel ${ptr}, ${p}`)

        return ctx.wrapArray(header, env)
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
