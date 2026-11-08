import { BytecodeBackend, QBEBackend } from '@/backend'
import { Instruction, Label } from '@/bytecode'
import { BytecodeEnv, QBEEnv } from '@/env'
import {
  type ASTMeta,
  type ASTNode,
  bool,
  bytecodeCheckType,
  CallSite,
  consCAR,
  consWith,
  internal,
  num,
  type Params,
  qbeBox,
  qbeCheckType,
  qbeConst,
  type SExprCell,
  type SExprSym,
  str,
  sym,
  Unit,
  vmVarType,
} from '@/type'
import { error, mustLookup } from '@/utils'
import type { Module } from '.'

class Eq extends Unit {
  override params: Params = { car: ['any', 'any'] }

  bytecode(ctx: BytecodeBackend, _env: BytecodeEnv, _site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[1]))
    ctx.emit(Instruction.Load(args[0]))
    ctx.emit(Instruction.Eq)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapBool(ctx.defineTemp(`ceql ${args[0]}, ${args[1]}`, env), env)
  }
}

class Cond extends Unit {
  override params: Params = { body: true }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, _args: number[]) {
    const end = new Label()

    let nextClause = new Label()

    const clauses = site.operands
    for (const [i, clause] of clauses.entries()) {
      nextClause.fillOffset(ctx.code.len)
      nextClause = new Label()

      Cond.#validateClause(clause)
      const predicate = Cond.#validatePredicate(
        clause,
        Cond.#isLastClause(i, clauses.length),
        (node) => {
          const pred = env.defineTemp()
          ctx.compileExpr(node, env)
          ctx.emit(Instruction.Save(pred))
          bytecodeCheckType(
            ctx,
            env,
            'bool',
            pred,
            node.meta,
            'The predicate type must be `bool`, found `{}`.',
          )
          return pred
        },
        (x) => {
          const t = env.defineTemp()
          ctx.compileExpr(bool(x), env)
          ctx.emit(Instruction.Save(t))
          return t
        },
      )

      ctx.emit(Instruction.Load(predicate))

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
          if (x.expr.type === 'cell') {
            const op = x.expr.car[0]
            if (op.expr.type === 'sym') {
              const unit = ctx.env.lookup(op.expr.value)
              if (unit instanceof Unit && unit.isStatement) {
                ctx.compileExpr(str('unit'), env)
                ctx.emit(Instruction.NativeCall)
              }
            }
          }
          if (i !== body.length - 1) {
            ctx.emit(Instruction.Pop)
          }
        }
      } else {
        ctx.compileExpr(str('unit'), env)
        ctx.emit(Instruction.NativeCall)
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
    ctx.compileExpr(str('unit'), env)
    ctx.emit(Instruction.NativeCall)

    end.fillOffset(ctx.code.len)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, _args: string[]) {
    const result = env.defineTemp()
    ctx.emit(`${result} =l copy ${qbeConst.unit}`)
    const end = env.defineBlock()

    let nextClause = env.defineBlock()

    const clauses = site.operands
    for (const [i, clause] of clauses.entries()) {
      // Insert the current branch label (as the preview branch jump target).
      ctx.emit(nextClause)
      // Generate the next branch label (used in the current branch `jnz`).
      nextClause = env.defineBlock()

      Cond.#validateClause(clause)
      const predicate = Cond.#validatePredicate(
        clause,
        Cond.#isLastClause(i, clauses.length),
        (node) => {
          const pred = ctx.compileExpr(node, env)
          qbeCheckType(
            ctx,
            env,
            'bool',
            pred,
            node.meta,
            'The predicate type must be `bool`, found `%s`.',
          )
          return pred
        },
        (x) => ctx.compileExpr(bool(x), env),
      )

      const body = env.defineBlock()
      ctx.emit(`jnz ${ctx.unwrapBool(predicate, env)}, ${body}, ${nextClause}`)
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

  static #isLastClause(index: number, clausesLen: number) {
    return index === clausesLen - 1
  }

  static #validatePredicate<T>(
    node: ASTNode<SExprCell>,
    isLastClause: boolean,
    runtimeValidate: (node: ASTNode) => T,
    compileBool: (x: boolean) => T,
  ) {
    if (node.expr.car.length === 0) {
      error(node.meta, `compiling: Clause must at least have a predicate.`)
    }

    const predicate = node.expr.car[0]
    switch (predicate.expr.type) {
      case 'bool':
        return compileBool(predicate.expr.value)
      case 'sym':
        if (predicate.expr.value !== 'else') {
          return runtimeValidate(predicate)
        }
        if (!isLastClause) {
          error(predicate.meta, 'compiling: The `else` clause must be the last.')
        }
        return compileBool(true)
      case 'cell':
        return runtimeValidate(predicate)
      default:
        error(
          predicate.meta,
          `compiling: The predicate type must be \`bool\`, found \`${predicate.expr.type === 'num' ? 'i64' : predicate.expr.type}\`.`,
        )
    }
  }

  static #validateClause(node: ASTNode): asserts node is ASTNode<SExprCell> {
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

class If extends Unit {
  override params: Params = {
    body: true,
    check({ operator, operands }) {
      if (operands.length === 0) {
        error(
          operator.meta,
          'compiling: bad syntax. `if` requires predicate and result expression.',
        )
      }
      if (operands.length === 1) {
        error(operator.meta, 'compiling: `if` requires result expression.')
      }
      if (operands.length > 3) {
        error(operands[3].meta, 'compiling: too many arguments passed to `if`')
      }
      const pred = operands[0]
      if (pred.expr.type === 'sym' && pred.expr.value === 'else') {
        error(pred.meta, 'compiling: Symbol `else` cannot be used as a predicate in `if`.')
      }
    },
  }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, _args: number[]) {
    ctx.compileExpr(If.#cond(site), env)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, _args: string[]) {
    return ctx.compileExpr(If.#cond(site), env)
  }

  static #cond({ operands }: CallSite): ASTNode<SExprCell> {
    return consCAR([
      sym('cond'),
      consCAR(operands.slice(0, 2)),
      ...(operands.length === 3 ? [consCAR([bool(true), operands[2]])] : []),
    ])
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

class Def extends Unit {
  override params: Params = { car: ['any', 'any'] }
  override lazy = true
  override isStatement = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    checkId(operands[0], 'def')

    ctx.compileExpr(operands[1], env)
    ctx.emit(Instruction.Save(env.defineVar(operands[0].expr.value)))
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    checkId(operands[0], 'def')

    // Ensure that values are evaluated first, then assigned.
    const x = ctx.compileExpr(operands[1], env)
    const slot = env.defineVar(operands[0].expr.value)
    ctx.emitPrologue(`${slot} =l alloc8 8`)
    ctx.emitPrologue(`storel ${qbeConst.unit}, ${slot}`)
    ctx.emit(`storel ${x}, ${slot}`)

    return ''
  }
}

class Set extends Unit {
  override params: Params = { car: ['any', 'any'] }
  override lazy = true
  override isStatement = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    const id = operands[0]
    checkId(id, 'set!')

    ctx.compileExpr(operands[1], env)
    if (id.expr.internal !== undefined) {
      if (typeof id.expr.internal !== 'number') {
        throw Error('invalid internal value')
      }
      ctx.emit(Instruction.Save(id.expr.internal))
    } else {
      const addr = mustLookup(id, env)
      if (typeof addr !== 'number') {
        error(id.meta, 'compiling: cannot mutate built-in unit')
      }
      ctx.emit(Instruction.Save(addr))
    }
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    const id = operands[0]
    checkId(id, 'set!')

    const x = ctx.compileExpr(operands[1], env)
    if (id.expr.internal !== undefined) {
      if (typeof id.expr.internal !== 'string') {
        throw Error('invalid internal value')
      }
      ctx.emit(`${id.expr.internal} =l copy ${x}`)
    } else {
      const innerId = mustLookup(id, env)
      if (typeof innerId !== 'string') {
        error(id.meta, 'compiling: cannot mutate built-in unit')
      }
      ctx.emit(`storel ${x}, ${innerId}`)
    }
    return ''
  }
}

class Loop extends Unit {
  override params: Params = { body: true }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    const scope = new BytecodeEnv(env)

    const start = ctx.code.len
    const end = new Label()
    scope.defineVarUnit('break', new Break(end))
    scope.defineVarUnit('continue', new Continue(start))

    for (const expr of operands) {
      ctx.compileExpr(expr, scope)
    }
    ctx.emit(Instruction.Jump(start - ctx.code.len))

    end.fillOffset(ctx.code.len)
    ctx.compileExpr(str('unit'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    const scope = new QBEEnv(env)

    const start = env.defineBlock()
    const end = env.defineBlock()
    scope.defineVarUnit('break', new Break(undefined, end))
    scope.defineVarUnit('continue', new Continue(undefined, start))

    // TODO: Fix control flow termination check.
    let terminated = false
    ctx.emit(start)
    for (const expr of operands) {
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
}

// TODO: check type after `:in` (both compile and run time)
class For extends Unit {
  override params: Params = { body: true }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { cell }: CallSite, _args: number[]) {
    const { meta } = cell
    For.#compileTo(
      cell,
      (xsNode) => {
        ctx.compileExpr(xsNode, env)
        const addr = env.defineTemp()
        ctx.emit(Instruction.Save(addr))
        return internal(addr, meta)
      },
      (x, xs, body) => {
        for (const node of For.#inNum(x, xs, body, meta)) {
          ctx.compileExpr(node, env)
        }
      },
      (x, xs, body) => {
        ctx.compileExpr(xs, env)
        ctx.compileExpr(str('type-of', meta), env)
        ctx.emit(Instruction.NativeCall)
        const type = env.defineTemp()
        ctx.emit(Instruction.Save(type))

        ctx.if(
          () => {
            ctx.emit(Instruction.Load(type))
            ctx.compileExpr(num(vmVarType.i64, meta), env)
            ctx.emit(Instruction.Eq)
          },
          () => {
            for (const node of For.#inNum(x, xs, body, meta)) {
              ctx.compileExpr(node, env)
            }
          },
        )

        ctx.if(
          () => {
            ctx.emit(Instruction.Load(type))
            ctx.compileExpr(num(vmVarType.arr, meta), env)
            ctx.emit(Instruction.Eq)
          },
          () => {
            ctx.compileExpr(num(0, meta), env)
            const i = env.defineTemp()
            ctx.emit(Instruction.Save(i))

            ctx.compileExpr(consCAR([sym('array-len', meta), xs], meta), env)
            const len = env.defineTemp()
            ctx.emit(Instruction.Save(len))

            ctx.compileExpr(
              For.#inArray(internal(i, meta), internal(len, meta), x, xs, body, meta),
              env,
            )
          },
        )
      },
      (pred, body) => ctx.compileExpr(For.#pred(pred, body, meta), env),
    )
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { cell }: CallSite, _args: string[]) {
    const { meta } = cell
    For.#compileTo(
      cell,
      (xsNode) => internal(ctx.compileExpr(xsNode, env), meta),
      (x, xs, body) => {
        for (const node of For.#inNum(x, xs, body, meta)) {
          ctx.compileExpr(node, env)
        }
      },
      (x, xs, body) => {
        if (typeof xs.expr.internal !== 'string') {
          throw Error('invalid internal value')
        }
        const tag = ctx.tag(xs.expr.internal, env)
        ctx.if(
          () => `ceqw ${tag}, ${qbeConst.i64}`,
          () => {
            for (const node of For.#inNum(x, xs, body, meta)) {
              ctx.compileExpr(node, env)
            }
          },
          { env },
        )
        ctx.if(
          [
            () => `ceqw ${tag}, ${qbeConst.box}`,
            () => `ceqw ${ctx.defineTemp(`loaduh ${xs.expr.internal}`, env)}, ${qbeBox.arr}`,
          ],
          () =>
            ctx.compileExpr(
              For.#inArray(
                internal(ctx.wrapI64('0', env), meta),
                internal(ctx.compileExpr(consCAR([sym('array-len', meta), xs], meta), env), meta),
                x,
                xs,
                body,
                meta,
              ),
              env,
            ),
          { env },
        )
      },
      (pred, body) => ctx.compileExpr(For.#pred(pred, body, meta), env),
    )
    return qbeConst.Unit
  }

  static #compileTo(
    { expr, meta }: ASTNode<SExprCell>,
    compileXs: (xsNode: ASTNode) => ASTNode<SExprSym>,
    forInNum: (x: ASTNode<SExprSym>, xs: ASTNode<SExprSym>, body: ASTNode[]) => void,
    forInAny: (x: ASTNode<SExprSym>, xs: ASTNode<SExprSym>, body: ASTNode[]) => void,
    forPred: (pred: ASTNode, body: ASTNode[]) => void,
  ) {
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
      function assertSym(x: ASTNode): asserts x is ASTNode<SExprSym> {
        if (x.expr.type !== 'sym') {
          error(
            x.meta,
            `compiling: expecting a symbol for variable binding, found \`${x.expr.type}\``,
          )
        }
      }
      assertSym(x)

      const xsNode = clause.expr.car[2]
      const xs = compileXs(xsNode)

      if (xsNode.expr.type === 'num') {
        forInNum(x, xs, body)
        return
      }

      if (xsNode.expr.type === 'sym' || xsNode.expr.type === 'cell') {
        forInAny(x, xs, body)
        return
      }
    }

    forPred(clause, body)
  }

  static #inNum(x: ASTNode<SExprSym>, xs: ASTNode<SExprSym>, body: ASTNode[], meta: ASTMeta) {
    const { num, sym, consCAR } = consWith(meta)
    return [
      consCAR([sym('def'), x, num(0)]),
      consCAR([
        sym('loop'),
        consCAR([sym('if'), consCAR([sym('>='), x, xs]), consCAR([sym('break')])]),
        ...body,
        consCAR([sym('set!'), x, consCAR([sym('+'), x, num(1)])]),
      ]),
    ]
  }

  static #inArray(
    i: ASTNode<SExprSym>,
    len: ASTNode<SExprSym>,
    x: ASTNode<SExprSym>,
    xs: ASTNode<SExprSym>,
    body: ASTNode[],
    meta: ASTMeta,
  ) {
    const { num, sym, consCAR } = consWith(meta)
    return consCAR([
      sym('loop'),
      consCAR([sym('if'), consCAR([sym('>='), i, len]), consCAR([sym('break')])]),
      consCAR([sym('def'), x, consCAR([sym('array-at'), xs, i])]),
      ...body,
      consCAR([sym('set!'), i, consCAR([sym('+'), i, num(1)])]),
    ])
  }

  static #pred(pred: ASTNode, body: ASTNode[], meta: ASTMeta) {
    const { sym, consCAR } = consWith(meta)
    return consCAR([
      sym('loop'),
      consCAR([
        sym('cond'),
        consCAR([pred, ...body]),
        consCAR([sym('else'), consCAR([sym('break')])]),
      ]),
    ])
  }
}

class Break extends Unit {
  override params: Params = { car: [] }
  override isStatement = true

  constructor(
    private bytecodeEnd?: Label,
    private qbeEnd?: string,
  ) {
    super()
  }

  bytecode(ctx: BytecodeBackend) {
    const from = ctx.code.len
    const jump = ctx.emit(Instruction.Jump(0))
    this.bytecodeEnd!.jumpFrom({
      from,
      fill: (offset) => jump.setInt16(1, offset, true),
    })
  }

  qbe(ctx: QBEBackend) {
    ctx.emit(`jmp ${this.qbeEnd}`)
    return ''
  }
}

class Continue extends Unit {
  override params: Params = { car: [] }
  override isStatement = true

  constructor(
    private bytecodeStart?: number,
    private qbeStart?: string,
  ) {
    super()
  }

  bytecode(ctx: BytecodeBackend) {
    ctx.emit(Instruction.Jump(this.bytecodeStart! - ctx.code.len))
  }

  qbe(ctx: QBEBackend) {
    ctx.emit(`jmp ${this.qbeStart}`)
    return ''
  }
}

class SizeOf extends Unit {
  override params: Params = { car: ['any'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv) {
    ctx.compileExpr(str('size-of'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, _site: CallSite, args: string[]) {
    return ctx.wrapI64(ctx.defineTemp(`call $size_of(l ${args[0]})`, env), env)
  }
}

class Call extends Unit {
  override params: Params = { car: ['sym'], cdr: true }
  override lazy = true

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, { operands }: CallSite, _args: number[]) {
    for (const operand of operands.slice(1).toReversed()) {
      ctx.compileExpr(operand, env)
    }
    ctx.compileExpr(str((operands[0].expr as SExprSym).value), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, { operands }: CallSite, _args: string[]) {
    return ctx.defineTemp(
      `call $${(operands[0].expr as SExprSym).value}(${operands
        .slice(1)
        .map((operand) => `l ${ctx.compileExpr(operand, env)}`)
        .join(', ')})`,
      env,
    )
  }
}

class Panic extends Unit {
  override params: Params = { car: ['str'] }

  bytecode(ctx: BytecodeBackend, env: BytecodeEnv, site: CallSite, args: number[]) {
    ctx.emit(Instruction.Load(args[0]))

    const { meta } = site.cell
    ctx.compileExpr(num(meta.column), env)
    ctx.compileExpr(num(meta.line), env)
    ctx.compileExpr(str(meta.fileName), env)

    ctx.compileExpr(str('panic'), env)
    ctx.emit(Instruction.NativeCall)
  }

  qbe(ctx: QBEBackend, env: QBEEnv, site: CallSite, args: string[]) {
    const { meta } = site.cell

    const fileName = ctx.env.defineTemp()
    ctx.emitGlobal(`data ${fileName} = { b "${meta.fileName}", b 0 }`)

    const size = ctx.defineTemp(`add ${args[0]}, 8`, env)
    ctx.emit(`${size} =l loadl ${size}`)
    const newSize = ctx.defineTemp(`add ${size}, 1`, env)

    const ptr = ctx.defineTemp(`add ${args[0]}, 16`, env)

    const message = ctx.defineTemp(`call $gc_alloc(l ${newSize})`, env)
    ctx.emit(`call $memset(l ${message}, w 0, l ${newSize})`)
    ctx.emit(`call $memcpy(l ${message}, l ${ptr}, l ${size})`)

    ctx.emit(`call $panic(l ${fileName}, w ${meta.line}, w ${meta.column}, l ${message})`)
    return qbeConst.Unit
  }
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
    if(pred: (() => string) | (() => string)[], thenBody: () => void, options: QBEIfOptions): void
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

function predWithCtx(ctx: QBEBackend, env: QBEEnv, hasElse: boolean, predIsValue: boolean) {
  const end = env.defineBlock()
  const elseBranch = hasElse ? env.defineBlock() : end

  const predicate = (pred: () => string) => {
    const thenBranch = env.defineBlock()
    const testResult = predIsValue ? pred() : ctx.defineTemp(pred(), env, 'w')
    ctx.emit(`jnz ${testResult}, ${thenBranch}, ${elseBranch}`)
    ctx.emit(thenBranch)
    return elseBranch
  }

  const predicates = (preds: (() => string)[]) => {
    if (preds.length === 0) {
      throw Error('no predicate')
    }
    let thenBranch: string | undefined
    for (const pred of preds) {
      thenBranch = env.defineBlock()
      const testResult = predIsValue ? pred() : ctx.defineTemp(pred(), env, 'w')
      ctx.emit(`jnz ${testResult}, ${thenBranch}, ${elseBranch}`)
      ctx.emit(thenBranch)
    }
    return elseBranch
  }

  return { predicate, predicates, end }
}

QBEBackend.prototype.if = function (pred, thenBody, { elseBody, env, predIsValue = false }) {
  const hasElse = !!elseBody
  const { predicate, predicates, end } = predWithCtx(this, env, hasElse, predIsValue)
  const elseBranch = Array.isArray(pred) ? predicates(pred) : predicate(pred)

  thenBody()
  if (hasElse) {
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
  { env, predIsValue = false, resultType = 'l' },
) {
  const { predicate, predicates, end } = predWithCtx(this, env, true, predIsValue)
  const elseBranch = Array.isArray(pred) ? predicates(pred) : predicate(pred)

  const result = env.defineTemp()
  const evalBranch = (body: (result: string) => string | void) => {
    const branchResult = body(result)
    if (branchResult) {
      this.emit(`${result} =${resultType} copy ${branchResult}`)
    }
  }

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
