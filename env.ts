import {
  isUnitConstructor,
  type BytecodeCompiler,
  type QBECompiler,
  type Unit,
  type UnitConstructor,
} from './type'

// TODO: improve `isUnitConstructor` check in `lookup` to more specific type check
// TODO: BytecodeEnv().#baseAddr and QBEEnv().#counter may be static to implement block variable scope.
export interface Environment<T extends Unit> {
  defineUnit(name: string, constructor: UnitConstructor<T>): void
}

export class BytecodeEnv implements Environment<BytecodeCompiler> {
  readonly #vars = new Map<
    string,
    number | UnitConstructor<BytecodeCompiler> | BytecodeCompiler
  >()
  #baseAddr = 0

  constructor(private readonly parent: BytecodeEnv | null = null) {}

  get localCount() {
    let count = 0
    for (const [, v] of this.#vars) {
      if (typeof v === 'number') {
        count++
      }
    }
    return count
  }

  defineUnit(name: string, constructor: UnitConstructor<BytecodeCompiler>) {
    this.#vars.set(name, constructor)
  }

  defineVarUnit(name: string, unit: BytecodeCompiler) {
    this.#vars.set(name, unit)
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

    // TODO: undefined variable or unit
    throw Error(`undefined variable: ${name}`)
  }
}

// TODO: Distinguish the identifier of the builtin and the external.
export class QBEEnv implements Environment<QBECompiler> {
  readonly #vars = new Map<
    string,
    (string | UnitConstructor<QBECompiler> | QBECompiler)[]
  >()
  #counter = 0

  constructor(private readonly parent: QBEEnv | null = null) {}

  get #isGlobal() {
    return this.parent === null
  }

  get slots() {
    return this.#vars
      .values()
      .flatMap((xs) => xs.filter((x) => typeof x === 'string'))
      .toArray()
  }

  defineUnit(name: string, constructor: UnitConstructor<QBECompiler>) {
    this.#vars.set(name, [constructor])
  }

  defineVarUnit(name: string, unit: QBECompiler) {
    this.#vars.set(name, [unit])
  }

  defineVar(name: string) {
    if (this.#isGlobal) {
      throw Error('QBEEnv: cannot define slot in global environment')
    }
    const id = this.genId('v')
    this.#vars.getOrInsert(name, []).push(id)
    return id
  }

  defineTemp() {
    return this.genId('t')
  }

  defineBlock() {
    return `@b_${this.#counter++}`
  }

  lookup(name: string): string | QBECompiler {
    if (this.#vars.has(name)) {
      const item = this.#vars.get(name)!.at(-1)!
      if (isUnitConstructor<QBECompiler>(item)) {
        return item()
      }
      return item
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    throw Error(`undefined variable: ${name}`)
  }

  genId(prefix: 't' | 'v') {
    return `${this.#isGlobal ? '$' : '%'}${prefix}_${this.#counter++}`
  }
}
