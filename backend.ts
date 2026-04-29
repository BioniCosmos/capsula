import { Instruction, serialize } from './bytecode'
import { Bytecode, TreeWalk, type Environment } from './env'
import { isList } from './list'
import { isNumber } from './number'
import { car, cdr } from './pair'
import { isString } from './string'
import {
  isBoolean,
  isBytecodeCompiler,
  isNil,
  isSymbol,
  isTreeWalkEvaluator,
  typeOf,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from './type'
import { VM } from './vm'

export interface Backend<T> {
  env: Environment
  compile(source: SExpr[]): T
  execute(artifact: T): void
}

export class TreeWalkBackend implements Backend<SExpr[]> {
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

export class BytecodeBackend implements Backend<Instruction[]> {
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
    this.#vm.execute(serialize(artifact))
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
