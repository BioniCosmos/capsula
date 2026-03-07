import type { Expr } from './types'

export class Environment {
  readonly #vars = new Map<string, Expr>()

  constructor(private readonly parent: Environment | null = null) {}

  define(name: string, value: Expr) {
    this.#vars.set(name, value)
  }

  lookup(name: string): Expr {
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
