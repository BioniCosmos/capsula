import type { Var } from './types'

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
}

export const env = new Environment()
