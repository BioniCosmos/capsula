import {
  isUnitConstructor,
  type BytecodeCompiler,
  type QBECompiler,
  type TreeWalkEvaluator,
  type Unit,
  type UnitConstructor,
  type Var,
} from './type'

// TODO: improve `isUnitConstructor` check in `lookup` to more specific type check
export interface Environment<T extends Unit> {
  defineUnit(name: string, constructor: UnitConstructor<T>): void
}

export namespace TreeWalk {
  export class Env implements Environment<TreeWalkEvaluator> {
    readonly #vars = new Map<string, Var | UnitConstructor<TreeWalkEvaluator>>()

    constructor(private readonly parent: Env | null = null) {}

    get locals() {
      return this.#vars as ReadonlyMap<string, Var>
    }

    defineUnit(name: string, constructor: UnitConstructor<TreeWalkEvaluator>) {
      this.#vars.set(name, constructor)
    }

    define(name: string, value: Var) {
      this.#vars.set(name, value)
    }

    lookup(name: string): Var | TreeWalkEvaluator {
      if (this.#vars.has(name)) {
        const item = this.#vars.get(name)!
        if (isUnitConstructor(item)) {
          return item()
        }
        return item
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
  export class Env implements Environment<BytecodeCompiler> {
    readonly #vars = new Map<
      string,
      number | UnitConstructor<BytecodeCompiler>
    >()
    #baseAddr = 0

    constructor(private readonly parent: Env | null = null) {}

    get locals() {
      return this.#vars as ReadonlyMap<string, number>
    }

    defineUnit(name: string, constructor: UnitConstructor<BytecodeCompiler>) {
      this.#vars.set(name, constructor)
    }

    defineVar(name: string) {
      const addr = this.#baseAddr++
      this.#vars.set(name, addr)
      return addr
    }

    lookup(name: string): number | BytecodeCompiler {
      if (this.#vars.has(name)) {
        const item = this.#vars.get(name)!
        if (isUnitConstructor(item)) {
          return item()
        }
        return item
      }

      if (this.parent) {
        return this.parent.lookup(name)
      }

      throw Error(`undefined variable: ${name}`)
    }
  }
}

export namespace QBE {
  export class Env implements Environment<QBECompiler> {
    readonly #vars = new Map<string, string | UnitConstructor<QBECompiler>>()
    #counter = 0

    constructor(private readonly parent: Env | null = null) {}

    get #isGlobal() {
      return this.parent === null
    }

    defineUnit(name: string, constructor: UnitConstructor<QBECompiler>) {
      this.#vars.set(name, constructor)
    }

    defineTemp() {
      return `%t_${this.#counter++}`
    }

    defineVar(name: string) {
      const id = `${this.#isGlobal ? '$' : '%'}v_${this.#counter++}_${name}`
      this.#vars.set(name, id)
      return id
    }

    lookup(name: string): string | QBECompiler {
      if (this.#vars.has(name)) {
        const item = this.#vars.get(name)!
        if (isUnitConstructor(item)) {
          return item()
        }
        return item
      }

      if (this.parent) {
        return this.parent.lookup(name)
      }

      throw Error(`undefined variable: ${name}`)
    }

    has(name: string): boolean {
      return this.#vars.has(name) || (this.parent?.has(name) ?? false)
    }
  }
}
