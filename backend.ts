import { encode } from '@msgpack/msgpack'
import { $ } from 'bun'
import { Instruction } from './bytecode'
import { BytecodeEnv, QBEEnv, type Environment } from './env'
import { parse } from './parser'
import {
  BytecodeFnChunk,
  checkArgs,
  hasArgumentChecker,
  isBytecodeCompiler,
  isQBECompiler,
  isUnit,
  qbeConst,
  QBEFnChunk,
  typeToQBETag,
  typeToVMVarType,
  type ASTNode,
  type BytecodeCompiler,
  type PrimitiveType,
  type QBECompiler,
  type SExprCell,
  type Unit,
} from './type'
import { error } from './utils'

export interface Backend<U extends Unit = Unit> {
  readonly env: Environment<U>
  compile(source: ASTNode[], output?: string): Promise<void>
  run(output: string): Promise<void>
  runtimeCheckArg(
    paramType: PrimitiveType,
    env: Environment<U>,
    node: ASTNode,
  ): void
}

export class BytecodeBackend implements Backend<BytecodeCompiler> {
  readonly env = new BytecodeEnv()
  readonly #functions: BytecodeFnChunk[] = []
  readonly #fnStack: number[] = []

  get #fn() {
    return this.#functions[this.#fnStack.at(-1)!]
  }

  get code() {
    return this.#fn.code
  }

  async compile(source: ASTNode[], output = 'bytecode.💊') {
    this.startFn()
    const mainEnv = new BytecodeEnv(this.env)
    for (const node of source) {
      this.compileExpr(node, mainEnv)
    }
    this.endFn(mainEnv.localCount)

    await Bun.write(
      output,
      encode(
        this.#functions.map((fn) => {
          if (import.meta.env.DEBUG === 'true') {
            console.log(fn.toString())
          }
          return fn.serialize()
        }),
      ),
    )
  }

  async run(output: string) {
    await Bun.spawn(['zig', 'build', 'run', '--', output], {
      cwd: 'vm',
      stdout: 'inherit',
    }).exited
  }

  runtimeCheckArg(paramType: PrimitiveType, env: BytecodeEnv, node: ASTNode) {
    const { meta } = node
    this.if(
      () => {
        this.compileExpr(node, env)
        this.compileExpr({ expr: { type: 'str', value: 'type-of' }, meta }, env)
        this.emit(Instruction.NativeCall)
        this.compileExpr(
          { expr: { type: 'num', value: typeToVMVarType(paramType) }, meta },
          env,
        )
        this.emit(Instruction.Ne)
      },
      () => {
        this.compileExpr(node, env)
        this.compileExpr(
          { expr: { type: 'str', value: 'type-name' }, meta },
          env,
        )
        this.emit(Instruction.NativeCall)
        this.panic(meta, `expecting \`${paramType}\`, found \`{}\``, env)
      },
    )
  }

  compileExpr(node: ASTNode, env: BytecodeEnv) {
    const { expr } = node
    switch (expr.type) {
      case 'bool':
      case 'num':
      case 'str':
        this.emit(Instruction.Push(this.#fn.constants.push(expr) - 1))
        return
      case 'sym': {
        const value = env.lookup(expr.value)
        if (typeof value !== 'number') {
          throw Error('TODO: `BytecodeCompiler.toString()`')
        }
        this.emit(Instruction.Load(value))
        return
      }
      case 'cell': {
        const sym = expr.car[0]
        if (sym.expr.type !== 'sym') {
          throw Error(`compiling: expecting symbol, found \`${sym.expr.type}\``)
        }

        const compiler = env.lookup(sym.expr.value)
        if (!isBytecodeCompiler(compiler)) {
          if (isUnit(compiler)) {
            error(
              sym.meta,
              'compiling: This unit is currently not supported by Bytecode backend.',
            )
          }
          error(sym.meta, 'compiling: This expression is not callable.')
        }

        const cell = node as ASTNode<SExprCell>
        if (hasArgumentChecker(compiler)) {
          checkArgs(compiler.checkRule, this, env, cell)
        }
        compiler.compile(this, cell, env)
      }
    }
  }

  emit(code: Instruction) {
    return this.code.push(code)
  }

  startFn() {
    const idx = this.#functions.push(new BytecodeFnChunk()) - 1
    this.#fnStack.push(idx)
    return idx
  }

  endFn(localCount: number) {
    this.#fn.localCount = localCount
    this.#fnStack.pop()
  }
}

export class QBEBackend implements Backend<QBECompiler> {
  readonly env = new QBEEnv()
  readonly #chunks: QBEFnChunk[] = []
  readonly #currentFn: number[] = []
  readonly #global = Array.of<string>()

  async compile(source: ASTNode[], output = 'a.out') {
    this.startFn('$main', '', 'w', true)
    this.emitPrologue(`call $map_init()`)
    const env = new QBEEnv(this.env)

    for (const node of source) {
      this.compileExpr(node, env)
    }

    const { slots } = env
    this.emitPrologue(`%frame =l alloc8 ${8 + 8 + 8 * slots.length}`)
    this.emitPrologue(`call $frame_push(l %frame, l ${slots.length})`)
    for (const [i, slot] of slots.entries()) {
      this.emitPrologue(`call $frame_slot_push(l ${i}, l ${slot})`)
    }

    this.emit(`call $gc_clear()`)
    this.emit(`call $frame_pop()`)
    this.emit(`call $map_deinit()`)

    this.endFn('0')

    const code =
      (this.#global.length !== 0 ? this.#global.join('\n') + '\n\n' : '') +
      this.#chunks.map((chunk) => chunk.build()).join('\n\n')
    let extra = ''
    if (import.meta.env.DEBUG === 'true') {
      const lines = code.split('\n')

      let rows = lines.length
      let pad = 0
      while (Math.trunc(rows) !== 0) {
        pad++
        rows /= 10
      }

      console.log(
        lines
          .map((line, i) => `${(i + 1).toString().padStart(pad)} | ${line}`)
          .join('\n'),
      )
      extra = '-fsanitize=address'
    }
    await $`qbe < ${new Response(code)} | ${import.meta.env.CLANG ?? 'clang'} -std=c23 ${extra} -o ${output} core.c mem.c -x assembler -`
  }

  async run(output: string) {
    await Bun.spawn([output], { stdout: 'inherit' }).exited
  }

  runtimeCheckArg(paramType: PrimitiveType, env: QBEEnv, node: ASTNode) {
    const x = this.compileExpr(node, env)
    this.if(
      () => {
        const baseCheck = this.defineTemp(
          `cnel ${this.tag(x, env)}, ${typeToQBETag(paramType)}`,
          env,
        )
        switch (paramType) {
          case 'bool':
          case 'i64':
            return baseCheck
          case 'arr':
          case 'struct': {
            const innerCheck = env.defineTemp()
            this.emit(`${innerCheck} =l loadl ${this.unwrapArray(x, env)}`)
            this.emit(
              `${innerCheck} =l cnel ${innerCheck}, ${paramType === 'arr' ? 0 : 1}`,
            )
            return this.defineTemp(`or ${baseCheck}, ${innerCheck}`, env)
          }
          default:
            throw Error('unimplemented')
        }
      },
      () =>
        this.panic(
          node.meta,
          `expecting \`${paramType}\`, found \`%s\``,
          `l ${this.defineTemp(`call $type_name(l ${x})`, env)}`,
        ),
      null,
      env,
    )
  }

  /**
   * - pointer: 000
   * - bool: 001
   *   - false = 0001
   *   - true = 1001
   * - unit = 10001
   * - i64 (small): 010
   * - array: 011
   */
  compileExpr(node: ASTNode, env: QBEEnv) {
    const { expr } = node
    switch (expr.type) {
      case 'bool':
        return expr.value ? qbeConst.True : qbeConst.False
      case 'num':
        return ((expr.value << 3) | qbeConst.i64).toString()
      case 'sym': {
        const x = env.lookup(expr.value)
        if (typeof x === 'string') {
          const id = env.defineTemp()
          this.emit(`${id} =l loadl ${x}`)
          return id
        }
        // TODO: Check type `QBECompiler`. Consider whether to allow shadowing keywords/builtin.
        throw Error('unimplemented')
      }
      case 'cell': {
        const sym = expr.car[0]
        if (sym.expr.type !== 'sym') {
          throw Error(`compiling: expecting symbol, found \`${sym.expr.type}\``)
        }

        const compiler = env.lookup(sym.expr.value)
        if (!isQBECompiler(compiler)) {
          if (isUnit(compiler)) {
            error(
              sym.meta,
              'compiling: This unit is currently not supported by QBE backend.',
            )
          }
          error(sym.meta, 'compiling: This expression is not callable.')
        }

        const cell = node as ASTNode<SExprCell>
        if (hasArgumentChecker(compiler)) {
          checkArgs(compiler.checkRule, this, env, cell)
        }
        return compiler.compileToQBE(this, cell, env)
      }
    }
    throw Error('unreachable')
  }

  compileArgs(cell: ASTNode, env: QBEEnv) {
    if (cell.expr.type != 'cell') {
      throw Error('compileArgs: invalid AST node type')
    }

    const args: string[] = []
    let protectCount = 0
    for (const node of cell.expr.car.slice(1)) {
      const arg = this.compileExpr(node, env)
      args.push(arg)
      if (node.expr.type === 'cell' && node.expr.car.length !== 0) {
        this.emit(`call $gc_retain(l ${arg})`)
        protectCount++
      }
    }

    for (let i = 0; i < protectCount; i++) {
      this.emit(`call $gc_release()`)
    }
    return args
  }

  startFn(id: string, params: string, type = 'l', isExport = false) {
    this.#chunks.push(new QBEFnChunk(id, params, type, isExport))
    this.#currentFn.push(this.#chunks.length - 1)
  }

  endFn(x: string) {
    this.emit(`ret ${x}`)
    this.#currentFn.pop()
  }

  emit(code: string) {
    this.#chunks[this.#currentFn.at(-1)!].emit(code)
  }

  emitPrologue(code: string) {
    this.#chunks[this.#currentFn.at(-1)!].emitPrologue(code)
  }

  emitGlobal(code: string) {
    this.#global.push(code)
  }

  capl(s: string, env: QBEEnv) {
    const exprs = parse(s)
    let result = qbeConst.Unit
    for (const expr of exprs) {
      result = this.compileExpr(expr, env)
    }
    return result
  }

  defineTemp(expr: string, env: QBEEnv) {
    const x = env.defineTemp()
    this.emit(`${x} =l ${expr}`)
    return x
  }
}
