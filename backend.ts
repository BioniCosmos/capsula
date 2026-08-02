import { encode } from '@msgpack/msgpack'
import { $ } from 'bun'
import { Instruction } from './bytecode'
import { Bytecode, QBE, type Environment } from './env'
import { isList, iter, type List } from './list'
import { car, cdr } from './pair'
import { parse } from './parser'
import { isString } from './string'
import {
  BytecodeFnChunk,
  isBytecodeCompiler,
  isQBECompiler,
  QBEFnChunk,
  qbeUnit,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type Unit,
} from './type'

export interface Backend<U extends Unit, Artifact> {
  readonly env: Environment<U>
  compile(source: SExpr[]): Artifact
}

export class BytecodeBackend implements Backend<BytecodeCompiler, void> {
  readonly env = new Bytecode.Env()
  readonly #functions: BytecodeFnChunk[] = []
  readonly #fnStack: number[] = []

  get #fn() {
    return this.#functions[this.#fnStack.at(-1)!]
  }

  get code() {
    return this.#fn.code
  }

  async compile(source: SExpr[]) {
    this.startFn()
    const mainEnv = new Bytecode.Env(this.env)
    for (const expr of source) {
      this.compileExpr(expr, mainEnv)
    }
    this.endFn(mainEnv.localCount)

    await Bun.write(
      'bytecode.💊',
      encode(this.#functions.map((fn) => fn.serialize())),
    )
  }

  compileExpr(expr: SExpr, env: Bytecode.Env) {
    if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
      this.emit(Instruction.Push(this.#fn.constants.push(expr) - 1))
      return
    }
    if (isSymbol(expr)) {
      const value = env.lookup(expr.value)
      if (typeof value !== 'number') {
        throw Error('TODO: `BytecodeCompiler.toString()`')
      }
      this.emit(Instruction.Load(value))
      return
    }
    if (isList(expr)) {
      const sym = car(expr)
      if (!isSymbol(sym)) {
        throw Error(`compiling: expecting symbol, found \`${typeOf(sym)}\``)
      }
      const compiler = env.lookup(sym.value)
      if (!isBytecodeCompiler(compiler)) {
        throw Error('compiling: not callable')
      }
      compiler.compile(this, cdr(expr), env)
      return
    }
    throw Error(`compiling: unexpected \`${expr}\``)
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

export class QBEBackend implements Backend<QBECompiler, void> {
  readonly env = new QBE.Env()
  readonly #chunks: QBEFnChunk[] = []
  readonly #currentFn: number[] = []
  readonly #global = Array.of<string>()

  async compile(source: SExpr[]) {
    this.startFn('$main', '', 'w', true)
    this.emitPrologue(`call $map_init()`)
    const env = new QBE.Env(this.env)

    for (const expr of source) {
      this.compileExpr(expr, env)
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
      this.#global.join('\n') +
      '\n\n' +
      this.#chunks.map((chunk) => chunk.build()).join('\n\n')
    await $`qbe < ${new Response(code)} | clang -std=c23 mem.c -x assembler -`
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
  compileExpr(expr: SExpr, env: QBE.Env) {
    if (expr === undefined) {
      return qbeUnit
    }
    if (isBoolean(expr)) {
      return expr ? (0b1001).toString() : (0b0001).toString()
    }
    if (isNumber(expr)) {
      return ((expr << 3) | 0b010).toString()
    }
    if (isSymbol(expr)) {
      const x = env.lookup(expr.value)
      if (x instanceof QBE.Slot) {
        const id = env.defineTemp()
        this.emit(`${id} =l loadl ${x.ptr}`)
        return id
      }
      // TODO: Check type `QBECompiler`. Consider whether to allow shadowing keywords/builtin.
      return x as string
    }
    if (isList(expr) && !isNil(expr)) {
      const sym = car(expr)
      if (!isSymbol(sym)) {
        throw Error(`compiling: expecting symbol, found \`${typeOf(sym)}\``)
      }
      const compiler = env.lookup(sym.value)
      if (!isQBECompiler(compiler)) {
        throw Error('compiling: not callable')
      }
      return compiler.compileToQBE(this, cdr(expr), env)
    }
    throw Error(`compiling: unexpected \`${expr}\``)
  }

  compileArgs(exprs: List, env: QBE.Env, expect?: number) {
    const args: string[] = []
    let protectCount = 0
    for (const expr of iter(exprs)) {
      const arg = this.compileExpr(expr as SExpr, env) ?? qbeUnit
      args.push(arg)
      if (isList(expr) && !isNil(expr)) {
        this.emit(`call $gc_retain(l ${arg})`)
        protectCount++
      }
    }
    if (expect !== undefined && args.length !== expect) {
      throw Error(`compileArgs: unexpected arguments`)
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

  capl(s: string, env: QBE.Env) {
    const exprs = parse(s)
    let result = qbeUnit
    for (const expr of exprs) {
      result = this.compileExpr(expr, env) ?? qbeUnit
    }
    return result
  }
}
