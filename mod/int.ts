import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
  type ASTNode,
  type BytecodeCompiler,
  type QBECompiler,
  type SExprCell,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

// TODO: `panic` should support string format to enhance the error message.
// TODO: Add `VM.Var` enum to the compiler frontend.
// TODO: Fix error message of `QBEBackend.compileArgs` (expect).
// TODO: Check if it is possible to fill cdr of a cell.
// TODO: Fix/Check the handling when `args.len == 0`.
// TODO: Support `ne` VM instruction.
// TODO: Handle edge integer conditions like JS integer, MessagePack integer, i64, i61.

function checkLen(cell: ASTNode<SExprCell>, expect: number) {
  const len = cell.expr.car.length - 1
  if (len < expect) {
    error(
      cell.expr.car[0].meta,
      `compiling: \`+\` expects ${expect} arguments, but found ${len}.`,
    )
  }
  if (len > expect) {
    error(
      cell.expr.car[1 + expect].meta,
      `compiling: \`+\` expects exactly ${expect} arguments, but found ${len}.`,
    )
  }
}

function bytecodeCheckI64(
  ctx: BytecodeBackend,
  env: BytecodeEnv,
  node: ASTNode,
) {
  const { meta } = node
  ctx.compileExpr(node, env)
  ctx.if(
    () => {
      ctx.compileExpr({ expr: { type: 'str', value: 'type-of' }, meta }, env)
      ctx.emit(Instruction.NativeCall)
      ctx.compileExpr({ expr: { type: 'num', value: 2 }, meta }, env)
      ctx.emit(Instruction.Eq)
    },
    () => {},
    () => {
      ctx.compileExpr(
        { expr: { type: 'str', value: 'expecting `i64`' }, meta },
        env,
      )
      ctx.compileExpr({ expr: { type: 'num', value: meta.column }, meta }, env)
      ctx.compileExpr({ expr: { type: 'num', value: meta.line }, meta }, env)
      ctx.compileExpr(
        { expr: { type: 'str', value: meta.fileName }, meta },
        env,
      )
      ctx.emit(Instruction.Panic)
    },
  )
}

function qbeCheckI64(ctx: QBEBackend, env: QBEEnv, node: ASTNode) {
  ctx.if(
    () =>
      ctx.defineTemp(
        `cnel ${ctx.tag(ctx.compileExpr(node, env), env)}, ${qbeConst.i64}`,
        env,
      ),
    () => {
      const { meta } = node

      const fileName = ctx.env.defineTemp()
      ctx.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

      const message = ctx.env.defineTemp()
      ctx.emitGlobal(`data ${message} = { b "expecting \`i64\`", b 0 }`)

      ctx.emit(
        `call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message})`,
      )
      return qbeConst.Unit
    },
    null,
    env,
  )
}

class Add implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    checkLen(cell, 2)
    bytecodeCheckI64(ctx, env, cell.expr.car[1])
    bytecodeCheckI64(ctx, env, cell.expr.car[2])
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Add)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    qbeCheckI64(ctx, env, cell.expr.car[1])
    qbeCheckI64(ctx, env, cell.expr.car[2])
    return ctx.wrapI64(
      ctx.defineTemp(
        `add ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }
}

class Sub implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Sub)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(
      `${result} =l sub ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Mul implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Mul)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(
      `${result} =l mul ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Div implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Div)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(
      `${result} =l div ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Rem implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Rem)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(
      `${result} =l rem ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
  }
}

class Lt implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Lt)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(`${result} =l csltl ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

class Gt implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Gt)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(`${result} =l csgtl ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

class Le implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Le)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(`${result} =l cslel ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

class Ge implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Ge)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(`${result} =l csgel ${lhs}, ${rhs}`)
    return ctx.wrapBool(result, env)
  }
}

class IsI64 implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const args = cell.expr.car.slice(1)
    if (args.length !== 1) {
      throw Error(`\`i64?\`: expecting 1 argument, found ${args.length}`)
    }
    ctx.compileExpr(args[0], env)
    ctx.emit(Instruction.IsI64)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const args = cell.expr.car.slice(1)
    if (args.length !== 1) {
      throw Error(`\`i64?\`: expecting 1 argument, found ${args.length}`)
    }

    const x = ctx.compileExpr(args[0], env)
    const tag = ctx.tag(x, env)
    const result = env.defineTemp()
    ctx.emit(`${result} =l ceql ${tag}, ${qbeConst.i64}`)
    return ctx.wrapBool(result, env)
  }
}

export default {
  name: 'integer',
  dependencies: [],
  units: {
    '+': Add,
    '-': Sub,
    '*': Mul,
    '/': Div,
    '%': Rem,
    '<': Lt,
    '>': Gt,
    '<=': Le,
    '>=': Ge,
    'i64?': IsI64,
  },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    wrapI64(x: string, env: QBEEnv): string
    unwrapI64(x: string, env: QBEEnv): string
  }
}

QBEBackend.prototype.wrapI64 = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, ${qbeConst.i64}`)
  return result
}

QBEBackend.prototype.unwrapI64 = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l sar ${x}, 3`)
  return result
}
