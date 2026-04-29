import {
  type BytecodeCompiler,
  type TreeWalkEvaluator,
  type Unit,
  type Var,
} from './types'

export interface Environment {
  defineUnit(name: string, constructor: () => Unit): void
}

export namespace TreeWalk {
  export class Env implements Environment {
    readonly #vars = new Map<string, Var | (() => TreeWalkEvaluator)>()

    constructor(private readonly parent: Env | null = null) {}

    get locals() {
      return this.#vars as ReadonlyMap<string, Var>
    }

    defineUnit(name: string, constructor: () => TreeWalkEvaluator): void {
      this.#vars.set(name, constructor)
    }

    define(name: string, value: Var) {
      this.#vars.set(name, value)
    }

    lookup(name: string): Var | TreeWalkEvaluator {
      if (this.#vars.has(name)) {
        const v = this.#vars.get(name)!
        if (typeof v === 'function') {
          return v()
        }
        return v
      }

      if (this.parent) {
        return this.parent.lookup(name)
      }

      throw Error(`undefined variable: ${name}`)
    }

    set(name: string, value: Var) {
      if (this.#vars.has(name)) {
        this.#vars.set(name, value)
        return
      }

      if (this.parent) {
        this.parent.set(name, value)
        return
      }

      throw Error(`undefined variable: ${name}`)
    }
  }
}

export namespace Bytecode {
  export class Env implements Environment {
    readonly #vars = new Map<string, number | (() => BytecodeCompiler)>()
    #baseAddr = 0

    constructor(private readonly parent: Env | null = null) {}

    get locals(): ReadonlyMap<string, number | (() => BytecodeCompiler)> {
      return this.#vars
    }

    defineVar(name: string) {
      const addr = this.#baseAddr++
      this.#vars.set(name, addr)
      return addr
    }

    defineUnit(name: string, compiler: () => BytecodeCompiler) {
      this.#vars.set(name, compiler)
    }

    lookup(name: string): number | BytecodeCompiler {
      if (this.#vars.has(name)) {
        const v = this.#vars.get(name)!
        if (typeof v === 'function') {
          return v()
        }
        return v
      }

      if (this.parent) {
        return this.parent.lookup(name)
      }

      throw Error(`undefined variable: ${name}`)
    }
  }
}
