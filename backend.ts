import { $ } from 'bun'
import { CodeBuffer, Instruction } from './bytecode'
import { Bytecode, QBE, TreeWalk, type Environment } from './env'
import { isList } from './list'
import { isNumber } from './number'
import { car, cdr } from './pair'
import { isString } from './string'
import {
  isBoolean,
  isBytecodeCompiler,
  isNil,
  isQBECompiler,
  isSymbol,
  isTreeWalkEvaluator,
  typeOf,
  type BytecodeCompiler,
  type QBECompiler,
  type SExpr,
  type TreeWalkEvaluator,
  type Unit,
  type Var,
} from './type'
import { VM } from './vm'

export interface Backend<U extends Unit, Artifact> {
  readonly env: Environment<U>
  compile(source: SExpr[]): Artifact
  execute(artifact: Artifact): void
}

export class TreeWalkBackend implements Backend<TreeWalkEvaluator, SExpr[]> {
  readonly env = new TreeWalk.Env()

  compile(source: SExpr[]) {
    return source
  }

  async execute(artifact: SExpr[]) {
    for (const expr of artifact) {
      const result = await this.evaluate(expr, this.env)
      if (result !== undefined) {
        console.log(result)
      }
    }
  }

  async evaluate(
    expr: SExpr,
    env: TreeWalk.Env,
  ): Promise<Var | TreeWalkEvaluator> {
    if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
      return expr
    }
    if (isSymbol(expr)) {
      return env.lookup(expr.value)
    }
    if (!isList(expr)) {
      throw Error('evaluating: expecting list, found pair')
    }
    const box = await this.evaluate(car(expr) as SExpr, env)
    if (isTreeWalkEvaluator(box)) {
      return box.eval(this, cdr(expr), env)
    }
    throw Error('unreachable')
  }
}

export class BytecodeBackend implements Backend<BytecodeCompiler, void> {
  readonly #vm: VM

  readonly env = new Bytecode.Env()
  readonly code = new CodeBuffer()

  constructor() {
    this.#vm = new VM()
  }

  [Symbol.dispose]() {
    this.#vm[Symbol.dispose]()
  }

  compile(source: SExpr[]) {
    for (const expr of source) {
      this.compileExpr(expr, this.env)
    }
  }

  execute() {
    console.log(this.#vm.execute(this.code.u8Array))
  }

  compileExpr(expr: SExpr, env: Bytecode.Env) {
    if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
      this.emit(Instruction.Push(this.#vm.addVar(expr)))
      return
    }
    if (isSymbol(expr)) {
      const value = this.env.lookup(expr.value)
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
      const compiler = this.env.lookup(sym.value)
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
}

export class QBEBackend implements Backend<QBECompiler, void> {
  readonly env = new QBE.Env()
  readonly #code = Array.of<string>()

  async compile(source: SExpr[]) {
    this.emit(`export function w $main() {\n@start`)
    for (const expr of source) {
      this.compileExpr(expr, this.env)
    }
    this.emit('ret 0\n}')
    const code = this.#code.join('\n')
    await $`qbe < ${new Response(code)} | clang -x assembler -`
  }

  execute() {
    throw new Error('Method not implemented.')
  }

  /**
   * - pointer: 000
   * - bool: 001
   *   - false = 0001
   *   - true = 1001
   * - void = 10001
   * - i64 (small): 010
   */
  compileExpr(expr: SExpr, env: QBE.Env) {
    if (expr === undefined) {
      return (0b10001).toString()
    }
    if (isBoolean(expr)) {
      return expr ? (0b1001).toString() : (0b0001).toString()
    }
    if (isNumber(expr)) {
      return ((expr << 3) | 0b010).toString()
    }
    if (isList(expr) && !isNil(expr)) {
      const sym = car(expr)
      if (!isSymbol(sym)) {
        throw Error(`compiling: expecting symbol, found \`${typeOf(sym)}\``)
      }
      const compiler = this.env.lookup(sym.value)
      if (!isQBECompiler(compiler)) {
        throw Error('compiling: not callable')
      }
      return compiler.compileToQBE(this, cdr(expr), env)
    }
    throw Error(`compiling: unexpected \`${expr}\``)
  }

  emit(code: string) {
    this.#code.push(code)
  }

  emitGlobal(code: string) {
    this.#code.unshift(code)
  }
}
