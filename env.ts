import type { Var } from './types'

export class Environment {
  readonly #vars = new Map<string, Var>()

  constructor(private readonly parent: Environment | null = null) {}

  define(name: string, value: Var) {
    this.#vars.set(name, value)
  }

  lookup(name: string): Var {
    if (this.#vars.has(name)) {
      return this.#vars.get(name)!
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    throw Error(`undefined variable: ${name}`)
  }
}

export const env = new Environment()
