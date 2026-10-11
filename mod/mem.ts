import type { QBEBackend } from '@/backend'
import type { QBEEnv } from '@/env'
import {
  qbeBox,
  qbeConst,
  qbeSegment,
  type ArgumentChecker,
  type ASTNode,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import type { Module } from '.'

// TODO: Do some optimization for constant?
// TODO: nested if is bad.
class Box implements QBECompiler, ArgumentChecker {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(`call $gc_retain(l ${x})`)

    const isBox = () =>
      ctx.defineTemp(`ceqw ${ctx.tag(x, env)}, ${qbeConst.box}`, env, 'w')
    const isNotBoxScalar = () =>
      ctx.defineTemp(
        `cnew ${ctx.defineTemp(`loaduh ${x}`, env)}, ${qbeBox.scalar}`,
        env,
        'w',
      )
    const isNotOnHeap = () =>
      ctx.defineTemp(
        `cnew ${ctx.defineTemp(`loaduh ${ctx.defineTemp(`add ${x}, 2`, env)}`, env)}, ${qbeSegment.heap}`,
        env,
        'w',
      )

    function boxScalar() {
      const box = ctx.defineTemp(`call $gc_alloc(l 16)`, env)
      ctx.emit(`storeh ${qbeBox.scalar}, ${box}`)
      ctx.emit(`storel ${x}, ${ctx.defineTemp(`add ${box}, 8`, env)}`)
      return box
    }

    function boxStackComposite() {
      const unitSize = ctx.if(
        () =>
          ctx.defineTemp(
            `ceqw ${ctx.defineTemp(`loaduh ${x}`, env)}, ${qbeBox.str}`,
            env,
            'w',
          ),
        () => '1',
        () => '8',
        env,
      )
      const dataSize = ctx.defineTemp(
        `mul ${ctx.defineTemp(`loadl ${ctx.defineTemp(`add ${x}, 8`, env)}`, env)}, ${unitSize}`,
        env,
      )
      const size = ctx.defineTemp(`add 16, ${dataSize}`, env)

      const box = ctx.defineTemp(`call $gc_alloc(l ${size})`, env)
      ctx.emit(`call $memcpy(l ${box}, l ${x}, l ${size})`)
      ctx.emit(
        `storeh ${qbeSegment.heap}, ${ctx.defineTemp(`add ${box}, 2`, env)}`,
      )
      return box
    }

    const box = ctx.if(
      isBox,
      () =>
        ctx.if(
          isNotBoxScalar,
          () => ctx.if(isNotOnHeap, boxStackComposite, boxScalar, env),
          boxScalar,
          env,
        ),
      boxScalar,
      env,
    )
    ctx.emit(`call $gc_release(l ${x})`)
    return box
  }

  checkRule: CheckRule = { car: ['any'] }
}

export default {
  name: 'mem',
  dependencies: [],
  units: { box: Box },
  prelude: '',
} satisfies Module
