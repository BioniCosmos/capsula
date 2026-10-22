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
class Box implements QBECompiler, ArgumentChecker {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(`call $gc_retain(l ${x})`)

    const isBox = () => `ceqw ${ctx.tag(x, env)}, ${qbeConst.box}`
    const isNotBoxScalar = () =>
      `cnew ${ctx.defineTemp(`loaduh ${x}`, env, 'w')}, ${qbeBox.scalar}`
    const isNotOnHeap = () =>
      `cnew ${ctx.defineTemp(`loaduh ${ctx.defineTemp(`add ${x}, 2`, env)}`, env, 'w')}, ${qbeSegment.heap}`

    function boxScalar(box: string) {
      ctx.emit(`${box} =l call $gc_alloc(l 16)`)
      ctx.emit(`storeh ${qbeBox.scalar}, ${box}`)
      ctx.emit(`storel ${x}, ${ctx.defineTemp(`add ${box}, 8`, env)}`)
    }

    function boxStackComposite(box: string) {
      const unitSize = ctx.ifExpr(
        () => `ceqw ${ctx.defineTemp(`loaduh ${x}`, env, 'w')}, ${qbeBox.str}`,
        () => '1',
        () => '8',
        { env },
      )
      const dataSize = ctx.defineTemp(
        `mul ${ctx.defineTemp(`loadl ${ctx.defineTemp(`add ${x}, 8`, env)}`, env)}, ${unitSize}`,
        env,
      )
      const size = ctx.defineTemp(`add 16, ${dataSize}`, env)

      ctx.emit(`${box} =l call $gc_alloc(l ${size})`)
      ctx.emit(`call $memcpy(l ${box}, l ${x}, l ${size})`)
      ctx.emit(
        `storeh ${qbeSegment.heap}, ${ctx.defineTemp(`add ${box}, 2`, env)}`,
      )
    }

    const box = ctx.ifExpr(
      [isBox, isNotBoxScalar, isNotOnHeap],
      boxStackComposite,
      boxScalar,
      { env },
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
