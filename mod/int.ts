import { type BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction } from '@/bytecode'
import type { BytecodeEnv, QBEEnv } from '@/env'
import {
  type ASTMeta,
  type CallSite,
  num,
  type Params,
  qbeConst,
  type SExprNum,
  Unit,
} from '@/type'
import { error } from '@/utils'
import type { Module } from '.'

// TODO: Unify `type-name` in both backends.
// TODO: Handle edge integer conditions like JS integer, MessagePack integer, i64, i61.

class Add extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Add)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapI64(
      ctx.defineTemp(`add ${ctx.unwrapI64(args[0], env)}, ${ctx.unwrapI64(args[1], env)}`, env),
      env,
    )
  }
}

class Sub extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Sub)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapI64(
      ctx.defineTemp(`sub ${ctx.unwrapI64(args[0], env)}, ${ctx.unwrapI64(args[1], env)}`, env),
      env,
    )
  }
}

class Mul extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Mul)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapI64(
      ctx.defineTemp(`mul ${ctx.unwrapI64(args[0], env)}, ${ctx.unwrapI64(args[1], env)}`, env),
      env,
    )
  }
}

function checkDivisor({ operands }: CallSite) {
  const { expr, meta } = operands[1]
  if ((expr as SExprNum).value === 0) {
    error(meta, 'compiling: The divisor cannot be zero.')
  }
}

function bytecodeCheckZero(ctx: BytecodeBackend, env: BytecodeEnv, x: number, meta: ASTMeta) {
  ctx.if(
    () => {
      ctx.emit(Instruction.Load(x))
      ctx.compileExpr(num(0, meta), env)
      ctx.emit(Instruction.Eq)
    },
    () => ctx.panic(meta, 'The divisor cannot be zero.', env),
  )
}

function qbeCheckZero(ctx: QBEBackend, env: QBEEnv, x: string, meta: ASTMeta) {
  ctx.if(
    () => `ceqw ${x}, ${ctx.compileExpr(num(0, meta), env)}`,
    () => ctx.panic(meta, 'The divisor cannot be zero.'),
    { env },
  )
}

class Div extends Unit {
  override params: Params = { car: ['i64', 'i64'], check: checkDivisor }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, args: number[]) {
    bytecodeCheckZero(ctx, env, args[1], site.operands[1].meta)

    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Div)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, args: string[]) {
    qbeCheckZero(ctx, env, args[1], site.operands[1].meta)

    return ctx.wrapI64(
      ctx.defineTemp(`div ${ctx.unwrapI64(args[0], env)}, ${ctx.unwrapI64(args[1], env)}`, env),
      env,
    )
  }
}

class Rem extends Unit {
  override params: Params = { car: ['i64', 'i64'], check: checkDivisor }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, args: number[]) {
    bytecodeCheckZero(ctx, env, args[1], site.operands[1].meta)

    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Rem)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, args: string[]) {
    qbeCheckZero(ctx, env, args[1], site.operands[1].meta)

    return ctx.wrapI64(
      ctx.defineTemp(`rem ${ctx.unwrapI64(args[0], env)}, ${ctx.unwrapI64(args[1], env)}`, env),
      env,
    )
  }
}

class Lt extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Lt)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapBool(ctx.defineTemp(`csltl ${args[0]}, ${args[1]}`, env), env)
  }
}

class Gt extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Gt)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapBool(ctx.defineTemp(`csgtl ${args[0]}, ${args[1]}`, env), env)
  }
}

class Le extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Le)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapBool(ctx.defineTemp(`cslel ${args[0]}, ${args[1]}`, env), env)
  }
}

class Ge extends Unit {
  override params: Params = { car: ['i64', 'i64'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Ge)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapBool(ctx.defineTemp(`csgel ${args[0]}, ${args[1]}`, env), env)
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
