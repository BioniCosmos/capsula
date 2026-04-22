import type { BytecodeCompiler, Var } from './types'

export class Environment {
  readonly #vars = new Map<string, Var | (() => Var)>()

  constructor(private readonly parent: Environment | null = null) {}

  get locals() {
    return this.#vars as ReadonlyMap<string, Var>
  }

  define(name: string, value: Var | (() => Var)) {
    this.#vars.set(name, value)
  }

  lookup(name: string): Var {
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

export const env = new Environment()

export class BytecodeVMEnv {
  readonly #vars = new Map<string, number | BytecodeCompiler>()

  constructor(private readonly parent: BytecodeVMEnv | null = null) {}

  get locals(): ReadonlyMap<string, number | BytecodeCompiler> {
    return this.#vars
  }

  define(name: string, addr: number | BytecodeCompiler) {
    this.#vars.set(name, addr)
  }

  lookup(name: string): number | BytecodeCompiler {
    if (this.#vars.has(name)) {
      return this.#vars.get(name)!
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    throw Error(`undefined variable: ${name}`)
  }
}
