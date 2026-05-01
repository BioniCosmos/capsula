import { $ } from 'bun'
import { Instruction, serialize } from './bytecode'
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

  compile(source: SExpr[]): SExpr[] {
    return source
  }

  execute(artifact: SExpr[]): void {
    for (const expr of artifact) {
      const result = this.evaluate(expr, this.env)
      if (result !== null) {
        console.log(result)
      }
    }
  }

  evaluate(expr: SExpr, env: TreeWalk.Env): Var | TreeWalkEvaluator {
    if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
      return expr
    }
    if (isSymbol(expr)) {
      return env.lookup(expr.value)
    }
    if (!isList(expr)) {
      throw Error('evaluating: expecting list, found pair')
    }
    const box = this.evaluate(car(expr) as SExpr, env)
    if (isTreeWalkEvaluator(box)) {
      return box.eval(this, cdr(expr), env)
    }
    throw Error('unreachable')
  }
}

export class BytecodeBackend implements Backend<
  BytecodeCompiler,
  Instruction[]
> {
  readonly #vm: VM
  readonly env = new Bytecode.Env()

  constructor() {
    this.#vm = new VM()
  }

  [Symbol.dispose]() {
    this.#vm[Symbol.dispose]()
  }

  compile(source: SExpr[]) {
    const bytecode = Array.of<Instruction>()
    for (const expr of source) {
      bytecode.push(...this.compileExpr(expr, this.env))
    }
    return bytecode
  }

  execute(artifact: Instruction[]): void {
    console.log(this.#vm.execute(serialize(artifact)))
  }

  compileExpr(expr: SExpr, env: Bytecode.Env) {
    if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
      return [Instruction.Push(this.#vm.addVar(expr))]
    }
    if (isSymbol(expr)) {
      const value = this.env.lookup(expr.value)
      if (typeof value !== 'number') {
        throw Error('TODO: `BytecodeCompiler.toString()`')
      }
      return [Instruction.Load(value)]
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
      return compiler.compile(this, cdr(expr), env)
    }
    throw Error(`compiling: unexpected \`${expr}\``)
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

  execute(_artifact: void): void {
    throw new Error('Method not implemented.')
  }

  compileExpr(expr: SExpr, env: QBE.Env) {
    if (isNumber(expr)) {
      return expr.toString()
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
