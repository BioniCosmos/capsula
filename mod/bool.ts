import { type BytecodeBackend, QBEBackend } from '@/backend'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  type ASTNode,
  bool,
  type CallSite,
  consCAR,
  internal,
  type Params,
  type SExprCell,
  sym,
  Unit,
} from '@/type'
import type { Module } from '.'

class And extends Unit {
  override params: Params = { car: ['bool', 'bool'] }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, _args: number[]) {
    ctx.compileExpr(And.#if(site), env)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, _args: string[]) {
    return ctx.compileExpr(And.#if(site), env)
  }

  static #if({ operands }: CallSite): ASTNode<SExprCell> {
    return consCAR([sym('if'), operands[0], operands[1], bool(false)])
  }
}

class Or extends Unit {
  override params: Params = { car: ['bool', 'bool'] }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, _args: number[]) {
    ctx.compileExpr(Or.#if(site), env)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, _args: string[]) {
    return ctx.compileExpr(Or.#if(site), env)
  }

  static #if({ operands }: CallSite): ASTNode<SExprCell> {
    return consCAR([sym('if'), operands[0], bool(true), operands[1]])
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
  }
}

QBEBackend.prototype.wrapBool = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, 1`)
  return result
}
