import { type BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  type ASTNode,
  bool,
  bytecodeCheckType,
  type CallSite,
  consCAR,
  internal,
  type Params,
  qbeCheckType,
  qbeConst,
  type SExprCell,
  sym,
  Unit,
} from '@/type'
import type { Module } from '.'

function bytecodeBool(ctx: BytecodeBackend, env: BytecodeEnv, node: ASTNode) {
  const x = env.defineTemp()
  ctx.compileExpr(node, env)
  ctx.emit(Instruction.Save(x))
  if (node.expr.type !== 'bool') {
    bytecodeCheckType(ctx, env, 'bool', x, node.meta)
  }
  return x
}

function qbeBool(ctx: QBEBackend, env: QBEEnv, node: ASTNode) {
  const x = ctx.compileExpr(node, env)
  if (node.expr.type !== 'bool') {
    qbeCheckType(ctx, env, 'bool', x, node.meta)
  }
  return x
}

class And extends Unit {
  override params: Params = { car: ['bool', 'bool'] }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    ctx.if(
      () => ctx.emit(Instruction.Load(bytecodeBool(ctx, env, operands[0]))),
      () => ctx.emit(Instruction.Load(bytecodeBool(ctx, env, operands[1]))),
      () => ctx.compileExpr(bool(false), env),
    )
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    return ctx.ifExpr(
      () => ctx.unwrapBool(qbeBool(ctx, env, operands[0]), env),
      () => qbeBool(ctx, env, operands[1]),
      () => qbeConst.False,
      { env, predIsValue: true },
    )
  }
}

class Or extends Unit {
  override params: Params = { car: ['bool', 'bool'] }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    ctx.if(
      () => ctx.emit(Instruction.Load(bytecodeBool(ctx, env, operands[0]))),
      () => ctx.compileExpr(bool(true), env),
      () => ctx.emit(Instruction.Load(bytecodeBool(ctx, env, operands[1]))),
    )
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    return ctx.ifExpr(
      () => ctx.unwrapBool(qbeBool(ctx, env, operands[0]), env),
      () => qbeConst.True,
      () => qbeBool(ctx, env, operands[1]),
      { env, predIsValue: true },
    )
  }
}

class Not extends Unit {
  override params: Params = { car: ['bool'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.compileExpr(Not.#eq(args[0]), env)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.compileExpr(Not.#eq(args[0]), env)
  }

  static #eq(x: unknown): ASTNode<SExprCell> {
    return consCAR([sym('='), internal(x), bool(false)])
  }
}

export default {
  name: 'bool',
  dependencies: ['core'],
  units: { and: And, or: Or, not: Not },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    wrapBool(x: string, env: QBEEnv): string
    unwrapBool(x: string, env: QBEEnv): string
  }
}

QBEBackend.prototype.wrapBool = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, 1`)
  return result
}

QBEBackend.prototype.unwrapBool = function qbeTest(x: string, env: QBEEnv) {
  return this.defineTemp(`shr ${x}, 3`, env, 'w')
}
