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
import type { Module } from '.'

class Add implements BytecodeCompiler, QBECompiler {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.emit(Instruction.Add)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env, 2)
    const result = env.defineTemp()
    ctx.emit(
      `${result} =l add ${ctx.unwrapI64(lhs, env)}, ${ctx.unwrapI64(rhs, env)}`,
    )
    return ctx.wrapI64(result, env)
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
