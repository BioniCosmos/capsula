import { QBEBackend, type BytecodeBackend } from '@/backend'
import type { Bytecode, QBE } from '@/env'
import type { ASTNode, BytecodeCompiler, QBECompiler, SExprCell } from '@/type'
import type { Module } from '.'

class And implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(And.#if(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    return ctx.compileExpr(And.#if(cell), env)
  }

  static #if({ expr, meta }: ASTNode<SExprCell>): ASTNode<SExprCell> {
    return {
      expr: {
        type: 'cell',
        car: [
          { expr: { type: 'sym', value: 'if' }, meta: expr.car[0].meta },
          expr.car[1],
          expr.car[2],
          { expr: { type: 'bool', value: false }, meta },
        ],
        cdr: null,
      },
      meta,
    }
  }
}

class Or implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(Or.#if(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    return ctx.compileExpr(Or.#if(cell), env)
  }

  static #if({ expr, meta }: ASTNode<SExprCell>): ASTNode<SExprCell> {
    return {
      expr: {
        type: 'cell',
        car: [
          { expr: { type: 'sym', value: 'if' }, meta: expr.car[0].meta },
          expr.car[1],
          { expr: { type: 'bool', value: true }, meta },
          expr.car[2],
        ],
        cdr: null,
      },
      meta,
    }
  }
}

class Not implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: Bytecode.Env) {
    ctx.compileExpr(Not.#eq(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBE.Env) {
    return ctx.compileExpr(Not.#eq(cell), env)
  }

  static #eq({ expr, meta }: ASTNode<SExprCell>): ASTNode<SExprCell> {
    return {
      expr: {
        type: 'cell',
        car: [
          { expr: { type: 'sym', value: '=' }, meta: expr.car[0].meta },
          expr.car[1],
          { expr: { type: 'bool', value: false }, meta },
        ],
        cdr: null,
      },
      meta,
    }
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
    wrapBool(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.wrapBool = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, 1`)
  return result
}
