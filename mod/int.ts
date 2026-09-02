import { QBEBackend, type BytecodeBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  qbeConst,
  type ArgumentChecker,
  type ASTNode,
  type BytecodeCompiler,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
  type SExprNum,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

// TODO: Unify `type-name` in both backends.
// TODO: Handle edge integer conditions like JS integer, MessagePack integer, i64, i61.

class Add implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Add)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapI64(
      ctx.defineTemp(
        `add ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Sub implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Sub)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapI64(
      ctx.defineTemp(
        `sub ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Mul implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Mul)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapI64(
      ctx.defineTemp(
        `mul ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

function compileTimeCheckZero({ expr, meta }: ASTNode) {
  if ((expr as SExprNum).value === 0) {
    error(meta, 'compiling: The divisor cannot be zero.')
  }
}

function bytecodeCheckZero(
  ctx: BytecodeBackend,
  env: BytecodeEnv,
  node: ASTNode,
) {
  const { meta } = node
  ctx.if(
    () => {
      ctx.compileExpr(node, env)
      ctx.compileExpr({ expr: { type: 'num', value: 0 }, meta }, env)
      ctx.emit(Instruction.Eq)
    },
    () => ctx.panic(meta, 'The divisor cannot be zero.', env),
  )
}

function qbeCheckZero(ctx: QBEBackend, env: QBEEnv, node: ASTNode) {
  const { meta } = node
  ctx.if(
    () =>
      ctx.defineTemp(
        `ceql ${ctx.compileExpr(node, env)}, ${ctx.compileExpr({ expr: { type: 'num', value: 0 }, meta }, env)}`,
        env,
      ),
    () => ctx.panic(meta, 'The divisor cannot be zero.'),
    null,
    env,
  )
}

class Div implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const divisor = cell.expr.car[2]
    compileTimeCheckZero(divisor)
    bytecodeCheckZero(ctx, env, divisor)

    ctx.compileExpr(divisor, env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Div)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const divisor = cell.expr.car[2]
    compileTimeCheckZero(divisor)
    qbeCheckZero(ctx, env, divisor)

    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapI64(
      ctx.defineTemp(
        `div ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Rem implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const divisor = cell.expr.car[2]
    compileTimeCheckZero(divisor)
    bytecodeCheckZero(ctx, env, divisor)

    ctx.compileExpr(divisor, env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Rem)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const divisor = cell.expr.car[2]
    compileTimeCheckZero(divisor)
    qbeCheckZero(ctx, env, divisor)

    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapI64(
      ctx.defineTemp(
        `rem ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Lt implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Lt)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`csltl ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Gt implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Gt)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`csgtl ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Le implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Le)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`cslel ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class Ge implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Ge)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`csgel ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['i64', 'i64'] }
}

class IsI64 implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.IsI64)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    return ctx.wrapBool(
      ctx.defineTemp(
        `ceql ${ctx.tag(ctx.compileExpr(cell.expr.car[1], env), env)}, ${qbeConst.i64}`,
        env,
      ),
      env,
    )
  }

  checkRule: CheckRule = { car: ['any'] }
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
