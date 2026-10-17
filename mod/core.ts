import { BytecodeBackend, QBEBackend, type Backend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import { BytecodeEnv, QBEEnv, type Environment } from '@/env'
import {
  consWith,
  qbeConst,
  type ArgumentChecker,
  type ASTMeta,
  type ASTNode,
  type BytecodeCompiler,
  type CheckRule,
  type QBECompiler,
  type SExprCell,
  type SExprSym,
} from '@/type'
import { error, mustLookup } from '@/utils'
import type { Module } from '.'

class Eq implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(cell.expr.car[1], env)
    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Eq)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const [lhs, rhs] = ctx.compileArgs(cell, env)
    return ctx.wrapBool(ctx.defineTemp(`ceql ${lhs}, ${rhs}`, env), env)
  }

  checkRule: CheckRule = { car: ['any', 'any'] }
}

class Cond implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const end = new Label()

    let nextClause = new Label()

    const clauses = cell.expr.car.slice(1)
    for (const [i, clause] of clauses.entries()) {
      this.#validateClause(clause)
      this.#validatePredicate(
        ctx,
        env,
        clause,
        this.#bytecodeValidatePredicateFormat,
      )

      const predicate = clause.expr.car[0]
      this.#replaceElse(predicate, this.#isLastClause(i, clauses.length))

      nextClause.fillOffset(ctx.code.len)
      nextClause = new Label()

      ctx.compileExpr(predicate, env)

      const jumpToNextFrom = ctx.code.len
      const jumpToNext = ctx.emit(Instruction.BEqZ(0))
      nextClause.jumpFrom({
        from: jumpToNextFrom,
        fill: (offset) => jumpToNext.setInt16(1, offset, true),
      })

      const body = clause.expr.car.slice(1)
      if (body.length !== 0) {
        const scope = new BytecodeEnv(env)
        for (const [i, x] of body.entries()) {
          ctx.compileExpr(x, scope)
          if (i !== body.length - 1) {
            ctx.emit(Instruction.Pop)
          }
        }
      } else {
        ctx.emit(Instruction.Unit)
      }

      const jumpToEndFrom = ctx.code.len
      const jumpToEnd = ctx.emit(Instruction.Jump(0))
      end.jumpFrom({
        from: jumpToEndFrom,
        fill: (offset) => jumpToEnd.setInt16(1, offset, true),
      })
    }

    nextClause.fillOffset(ctx.code.len)
    // It is expected that the following `unit` pushing instruction is before
    // the end label. This one should be only evaluated when no clauses are
    // evaluated (all test results are `false` or no clauses at all) at runtime.
    // If one clauses runs, the body result or the previous `unit` (in the
    // `else` above) will be pushed to the evaluation stack. Then the `jump` to
    // end instruction will skip this instruction. It turns out that no excess
    // value will be stored to the evaluation stack.
    ctx.emit(Instruction.Unit)

    end.fillOffset(ctx.code.len)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeConst.unit}`)
    const end = env.defineBlock()

    let nextClause = env.defineBlock()

    const clauses = cell.expr.car.slice(1)
    for (const [i, clause] of clauses.entries()) {
      // Insert the current branch label (as the preview branch jump target).
      ctx.emit(nextClause)
      // Generate the next branch label (used in the current branch `jnz`).
      nextClause = env.defineBlock()

      this.#validateClause(clause)
      this.#validatePredicate(
        ctx,
        env,
        clause,
        this.#qbeValidatePredicateFormat,
      )

      const predicate = clause.expr.car[0]
      this.#replaceElse(predicate, this.#isLastClause(i, clauses.length))

      const testResult = env.defineTemp()
      ctx.emit(`${testResult} =l copy ${ctx.compileExpr(predicate, env)}`)
      ctx.emit(`${testResult} =l shr ${testResult}, 3`)

      const body = env.defineBlock()
      ctx.emit(`jnz ${testResult}, ${body}, ${nextClause}`)
      ctx.emit(body)

      const scope = new QBEEnv(env)
      let evaluated = qbeConst.Unit
      for (const x of clause.expr.car.slice(1)) {
        evaluated = ctx.compileExpr(x, scope)
        if (evaluated === '') {
          break
        }
      }
      if (evaluated !== '') {
        ctx.emit(`${result} =l copy ${evaluated}`)
        ctx.emit(`jmp ${end}`)
      }
    }

    ctx.emit(nextClause)

    ctx.emit(end)
    return result
  }

  checkRule: CheckRule = {}

  #replaceElse(predicate: ASTNode, isLastClause: boolean) {
    if (predicate.expr.type === 'sym' && predicate.expr.value === 'else') {
      if (isLastClause) {
        predicate.expr = { type: 'bool', value: true }
      } else {
        error(predicate.meta, 'compiling: The `else` clause must be the last.')
      }
    }
  }

  #isLastClause(index: number, clausesLen: number) {
    return index === clausesLen - 1
  }

  #validatePredicate(
    ctx: Backend,
    env: Environment,
    { expr, meta }: ASTNode<SExprCell>,
    runtimeFormat: string,
  ) {
    if (expr.car.length === 0) {
      error(meta, `compiling: Clause must at least have a predicate.`)
    }

    const predicate = expr.car[0]
    switch (predicate.expr.type) {
      case 'bool':
        break
      case 'sym':
        if (predicate.expr.value !== 'else') {
          ctx.runtimeCheckArg('bool', env, predicate, runtimeFormat)
        }
        break
      case 'cell':
        ctx.runtimeCheckArg('bool', env, predicate, runtimeFormat)
        break
      default:
        error(
          predicate.meta,
          `compiling: The predicate type must be \`bool\`, found \`${predicate.expr.type === 'num' ? 'i64' : predicate.expr.type}\`.`,
        )
    }
  }

  #bytecodeValidatePredicateFormat = `The predicate type must be \`bool\`, found \`{}\`.`
  #qbeValidatePredicateFormat = `The predicate type must be \`bool\`, found \`%s\`.`

  #validateClause(node: ASTNode): asserts node is ASTNode<SExprCell> {
    const { expr, meta } = node

    if (expr.type !== 'cell') {
      error(
        meta,
        `compiling: expecting clause, found \`${expr.value}\` (\`${expr.type === 'num' ? 'i64' : expr.type}\`)`,
      )
    }

    if (expr.cdr !== null) {
      error(expr.cdr.meta, 'compiling: unexpected `cdr`')
    }
  }
}

class If implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    ctx.compileExpr(If.#cond(cell), env)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    return ctx.compileExpr(If.#cond(cell), env)
  }

  checkRule: CheckRule = {}

  static #cond({ expr, meta }: ASTNode<SExprCell>): ASTNode<SExprCell> {
    const { car } = expr
    const unit = car[0]
    if (car.length === 1) {
      error(
        unit.meta,
        'compiling: bad syntax. `if` requires predicate and result expression.',
      )
    }
    if (car.length === 2) {
      error(unit.meta, 'compiling: `if` requires result expression.')
    }
    if (car.length > 4) {
      error(car[4].meta, 'compiling: too many arguments passed to `if`')
    }

    const pred = car[1]
    if (pred.expr.type === 'sym' && pred.expr.value === 'else') {
      error(
        pred.meta,
        'compiling: Symbol `else` cannot be used as a predicate in `if`.',
      )
    }

    return {
      expr: {
        type: 'cell',
        car: [
          { expr: { type: 'sym', value: 'cond' }, meta: unit.meta },
          {
            expr: { type: 'cell', car: [pred, expr.car[2]], cdr: null },
            meta,
          },
          ...(car.length === 4
            ? [
                {
                  expr: {
                    type: 'cell' as const,
                    car: [
                      { expr: { type: 'bool' as const, value: true }, meta },
                      expr.car[3],
                    ],
                    cdr: null,
                  },
                  meta,
                },
              ]
            : []),
        ],
        cdr: null,
      },
      meta,
    }
  }
}

function checkId(id: ASTNode, unit: string): asserts id is ASTNode<SExprSym> {
  const { type } = id.expr
  if (type !== 'sym') {
    error(
      id.meta,
      `compiling: Bad syntax. \`${unit}\` requires a symbol as variable identifier, found \`${type === 'num' ? 'i64' : type}\`.`,
    )
  }
}

class Def implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const id = cell.expr.car[1]
    checkId(id, 'def')

    ctx.compileExpr(cell.expr.car[2], env)
    ctx.emit(Instruction.Save(env.defineVar(id.expr.value)))

    ctx.emit(Instruction.Unit)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    checkId(id, 'def')

    // Ensure that values are evaluated first, then assigned.
    const x = ctx.compileExpr(cell.expr.car[2], env)
    const slot = env.defineVar(id.expr.value)
    ctx.emitPrologue(`${slot} =l alloc8 8`)
    ctx.emitPrologue(`storel ${qbeConst.unit}, ${slot}`)
    ctx.emit(`storel ${x}, ${slot}`)

    return qbeConst.Unit
  }

  checkRule: CheckRule = { car: ['any', 'any'] }
}

class Set implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const id = cell.expr.car[1]
    checkId(id, 'set!')

    ctx.compileExpr(cell.expr.car[2], env)
    const addr = mustLookup(id, env)
    if (typeof addr !== 'number') {
      error(id.meta, 'compiling: cannot mutate built-in unit')
    }
    ctx.emit(Instruction.Save(addr))
    ctx.emit(Instruction.Unit)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    checkId(id, 'set!')

    const x = ctx.compileExpr(cell.expr.car[2], env)
    const innerId = mustLookup(id, env)
    if (typeof innerId !== 'string') {
      error(id.meta, 'compiling: cannot mutate built-in unit')
    }
    ctx.emit(`storel ${x}, ${innerId}`)
    return qbeConst.Unit
  }

  checkRule: CheckRule = { car: ['any', 'any'] }
}

class Loop implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    const scope = new BytecodeEnv(env)

    const start = ctx.code.len
    const end = new Label()
    scope.defineVarUnit('break', new BytecodeBreak(end))
    scope.defineVarUnit('continue', new BytecodeContinue(start))

    for (const expr of cell.expr.car.slice(1)) {
      ctx.compileExpr(expr, scope)
    }
    ctx.emit(Instruction.Jump(start - ctx.code.len))

    end.fillOffset(ctx.code.len)
    ctx.emit(Instruction.Unit)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const scope = new QBEEnv(env)

    const start = env.defineBlock()
    const end = env.defineBlock()
    scope.defineVarUnit('break', new QBEBreak(end))
    scope.defineVarUnit('continue', new QBEContinue(start))

    let terminated = false
    ctx.emit(start)
    for (const expr of cell.expr.car.slice(1)) {
      if (ctx.compileExpr(expr, scope) === '') {
        terminated = true
        break
      }
    }
    if (!terminated) {
      ctx.emit(`jmp ${start}`)
    }

    ctx.emit(end)
    return qbeConst.Unit
  }

  checkRule: CheckRule = {}
}

// Add error branch test cases
class For implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(ctx: BytecodeBackend, cell: ASTNode<SExprCell>, env: BytecodeEnv) {
    throw new Error('Method not implemented.')
  }

  compileToQBE(
    ctx: QBEBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: QBEEnv,
  ) {
    const { bool, num, str, sym, consCAR } = consWith(meta)

    if (expr.cdr !== null) {
      error(expr.cdr.meta, 'compiling: unexpected `cdr`')
    }
    if (expr.car.length < 2) {
      error(meta, 'compiling: missing clause')
    }

    const clause = expr.car[1]
    const body = expr.car.slice(2)
    // a very strict match for `:in` pattern. May switch to more flexible rules
    // in the future if there are more forms.
    if (
      clause.expr.type === 'cell' &&
      clause.expr.cdr === null &&
      clause.expr.car.length === 3 &&
      clause.expr.car[1].expr.type === 'sym' &&
      clause.expr.car[1].expr.value === ':in'
    ) {
      const x = clause.expr.car[0]
      if (x.expr.type !== 'sym') {
        error(
          x.meta,
          `compiling: expecting a symbol for variable binding, found \`${x.expr.type}\``,
        )
      }
      const xsNode = clause.expr.car[2]

      function forInNum() {
        ctx.compileExpr(consCAR([sym('def'), x, num(0)]), env)
        ctx.compileExpr(
          consCAR([
            sym('loop'),
            consCAR([
              sym('if'),
              consCAR([sym('>='), x, xsNode]),
              consCAR([sym('break')]),
            ]),
            ...body,
            consCAR([sym('set!'), x, consCAR([sym('+'), x, num(1)])]),
          ]),
          env,
        )
      }

      if (xsNode.expr.type === 'num') {
        forInNum()
        return qbeConst.Unit
      }

      if (xsNode.expr.type === 'sym' || xsNode.expr.type === 'cell') {
        const xs = ctx.compileExpr(xsNode, env)
        ctx.if(() => `ceqw ${ctx.tag(xs, env)}, ${qbeConst.i64}`, forInNum, {
          env,
        })
        return qbeConst.Unit
      }
    }

    throw new Error('Method not implemented.')
  }

  checkRule: CheckRule = {}
}

class BytecodeBreak implements BytecodeCompiler, ArgumentChecker {
  constructor(private end: Label) {}

  compile(ctx: BytecodeBackend, _cell: ASTNode<SExprCell>, _env: BytecodeEnv) {
    const from = ctx.code.len
    const jump = ctx.emit(Instruction.Jump(0))
    this.end.jumpFrom({
      from,
      fill: (offset) => jump.setInt16(1, offset, true),
    })
  }

  checkRule: CheckRule = { car: [] }
}

class BytecodeContinue implements BytecodeCompiler, ArgumentChecker {
  constructor(private start: number) {}

  compile(ctx: BytecodeBackend, _cell: ASTNode<SExprCell>, _env: BytecodeEnv) {
    ctx.emit(Instruction.Jump(this.start - ctx.code.len))
  }

  checkRule: CheckRule = { car: [] }
}

class QBEBreak implements QBECompiler, ArgumentChecker {
  constructor(private end: string) {}

  compileToQBE(ctx: QBEBackend, _cell: ASTNode<SExprCell>, _env: QBEEnv) {
    ctx.emit(`jmp ${this.end}`)
    return ''
  }

  checkRule: CheckRule = { car: [] }
}

class QBEContinue implements QBECompiler, ArgumentChecker {
  constructor(private start: string) {}

  compileToQBE(ctx: QBEBackend, _cell: ASTNode<SExprCell>, _env: QBEEnv) {
    ctx.emit(`jmp ${this.start}`)
    return ''
  }

  checkRule: CheckRule = { car: [] }
}

class SizeOf implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(
    ctx: BytecodeBackend,
    { meta }: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ) {
    ctx.compileExpr({ expr: { type: 'str', value: 'size-of' }, meta }, env)
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const x = ctx.compileExpr(cell.expr.car[1], env)
    return ctx.wrapI64(ctx.defineTemp(`call $size_of(l ${x})`, env), env)
  }

  checkRule: CheckRule = { car: ['any'] }
}

// TODO: bytecode backend
class Call implements QBECompiler {
  compileToQBE(ctx: QBEBackend, cell: ASTNode<SExprCell>, env: QBEEnv) {
    const id = cell.expr.car[1]
    if (id.expr.type !== 'sym') {
      throw Error(
        `compiling \`call\`: expecting symbol, found \`${id.expr.type}\``,
      )
    }

    const result = env.defineTemp()
    ctx.emit(
      `${result} =l call $${id.expr.value}(${cell.expr.car
        .slice(2)
        .map((arg) => `l ${ctx.compileExpr(arg, env)}`)
        .join(', ')})`,
    )
    return result
  }
}

class Panic implements BytecodeCompiler, QBECompiler, ArgumentChecker {
  compile(
    ctx: BytecodeBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: BytecodeEnv,
  ) {
    ctx.compileExpr(expr.car[1], env)

    ctx.compileExpr({ expr: { type: 'num', value: meta.column }, meta }, env)
    ctx.compileExpr({ expr: { type: 'num', value: meta.line }, meta }, env)
    ctx.compileExpr({ expr: { type: 'str', value: meta.fileName }, meta }, env)

    ctx.compileExpr({ expr: { type: 'str', value: 'panic' }, meta }, env)
    ctx.emit(Instruction.NativeCall)
  }

  compileToQBE(
    ctx: QBEBackend,
    { expr, meta }: ASTNode<SExprCell>,
    env: QBEEnv,
  ) {
    const fileName = ctx.env.defineTemp()
    ctx.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

    const s = ctx.compileExpr(expr.car[1], env)

    const size = ctx.defineTemp(`add ${s}, 8`, env)
    ctx.emit(`${size} =l loadl ${size}`)
    const newSize = ctx.defineTemp(`add ${size}, 1`, env)

    const ptr = ctx.defineTemp(`add ${s}, 16`, env)

    const message = ctx.defineTemp(`call $gc_alloc(l ${newSize})`, env)
    ctx.emit(`call $memset(l ${message}, w 0, l ${newSize})`)
    ctx.emit(`call $memcpy(l ${message}, l ${ptr}, l ${size})`)

    ctx.emit(
      `call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message})`,
    )
    return qbeConst.Unit
  }

  checkRule: CheckRule = { car: ['str'] }
}

export default {
  name: 'core',
  dependencies: [],
  units: {
    '=': Eq,
    cond: Cond,
    if: If,
    def: Def,
    'set!': Set,
    loop: Loop,
    for: For,
    'size-of': SizeOf,
    call: Call,
    panic: Panic,
  },
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface BytecodeBackend {
    if(pred: () => void, thenBody: () => void, elseBody?: () => void): void
    panic(meta: ASTMeta, format: string, env: BytecodeEnv): void
  }

  type QBEIfOptions = {
    elseBody?: () => void
    env: QBEEnv
    predIsValue?: boolean
    resultType?: string
  }

  interface QBEBackend {
    if(
      pred: (() => string) | (() => string)[],
      thenBody: () => void,
      options: QBEIfOptions,
    ): void
    ifExpr(
      pred: (() => string) | (() => string)[],
      thenBody: (result: string) => string | void,
      elseBody: (result: string) => string | void,
      options: Omit<QBEIfOptions, 'elseBody'>,
    ): string
    panic(meta: ASTMeta, format: string, ...args: string[]): void
  }
}

BytecodeBackend.prototype.if = function (pred, thenBody, elseBody) {
  pred()

  const elseBranch = new Label()
  const end = new Label()

  const skipThenFrom = this.code.len
  const skipThen = this.emit(Instruction.BEqZ(0))
  ;(elseBody !== undefined ? elseBranch : end).jumpFrom({
    from: skipThenFrom,
    fill: (offset) => skipThen.setInt16(1, offset, true),
  })

  thenBody()
  const jumpToEndFrom = this.code.len
  const jumpToEnd = this.emit(Instruction.Jump(0))
  end.jumpFrom({
    from: jumpToEndFrom,
    fill: (offset) => jumpToEnd.setInt16(1, offset, true),
  })

  if (elseBody !== undefined) {
    elseBranch.fillOffset(this.code.len)
    elseBody()
  }

  end.fillOffset(this.code.len)
}

BytecodeBackend.prototype.panic = function (meta, format, env) {
  this.compileExpr({ expr: { type: 'str', value: format }, meta }, env)

  this.compileExpr({ expr: { type: 'num', value: meta.column }, meta }, env)
  this.compileExpr({ expr: { type: 'num', value: meta.line }, meta }, env)
  this.compileExpr({ expr: { type: 'str', value: meta.fileName }, meta }, env)

  this.compileExpr({ expr: { type: 'str', value: 'panic' }, meta }, env)
  this.emit(Instruction.NativeCall)
}

QBEBackend.prototype.if = function (
  pred,
  thenBody,
  { elseBody, env, predIsValue = false },
) {
  const thenBranch = env.defineBlock()
  const end = env.defineBlock()

  if (Array.isArray(pred)) {
    throw Error('unimplemented')
  }

  const testResult = predIsValue ? pred() : this.defineTemp(pred(), env, 'w')
  if (elseBody === undefined) {
    this.emit(`jnz ${testResult}, ${thenBranch}, ${end}`)

    this.emit(thenBranch)
    thenBody()
  } else {
    const elseBranch = env.defineBlock()
    this.emit(`jnz ${testResult}, ${thenBranch}, ${elseBranch}`)

    this.emit(thenBranch)
    thenBody()
    this.emit(`jmp ${end}`)

    this.emit(elseBranch)
    elseBody()
  }
  this.emit(end)
}

QBEBackend.prototype.ifExpr = function (
  pred,
  thenBody,
  elseBody,
  { env, predIsValue = true, resultType = 'l' },
) {
  const thenBranch = env.defineBlock()
  const end = env.defineBlock()
  const result = env.defineTemp()

  const evalBranch = (body: (result: string) => string | void) => {
    const branchResult = body(result)
    if (branchResult) {
      this.emit(`${result} =${resultType} copy ${branchResult}`)
    }
  }

  if (Array.isArray(pred)) {
    throw Error('unimplemented')
  }

  const testResult = predIsValue ? this.defineTemp(pred(), env, 'w') : pred()
  const elseBranch = env.defineBlock()
  this.emit(`jnz ${testResult}, ${thenBranch}, ${elseBranch}`)

  this.emit(thenBranch)
  evalBranch(thenBody)
  this.emit(`jmp ${end}`)

  this.emit(elseBranch)
  evalBranch(elseBody)

  this.emit(end)
  return result
}

QBEBackend.prototype.panic = function (meta, format, ...args) {
  const fileName = this.env.defineTemp()
  this.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

  const message = this.env.defineTemp()
  this.emitGlobal(`data ${message} = { b "${format}", b 0 }`)

  this.emit(
    `call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message}, ..., ${args.join(', ')})`,
  )
}
