import {
  isUnitConstructor,
  type BytecodeCompiler,
  type QBECompiler,
  type Unit,
  type UnitConstructor,
} from './type'

// TODO: improve `isUnitConstructor` check in `lookup` to more specific type check
export interface Environment<T extends Unit> {
  defineUnit(name: string, constructor: UnitConstructor<T>): void
}

// TODO: Tidy up functions. (defineVar + defineUnit + lookup ?)
export class BytecodeEnv implements Environment<BytecodeCompiler> {
  readonly #vars = new Map<
    string,
    number | UnitConstructor<BytecodeCompiler> | BytecodeCompiler
  >()
  #baseAddr = 0

  constructor(private readonly parent: BytecodeEnv | null = null) {}

  get locals() {
    return this.#vars as ReadonlyMap<string, number>
  }

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

    throw Error(`undefined variable: ${name}`)
  }
}

// TODO: Remove the circular import between `env` and `mod/fn`.
// TODO: Distinguish the identifier of the builtin and the external.
export class QBEEnv implements Environment<QBECompiler> {
  readonly #vars = new Map<
    string,
    (string | Slot | UnitConstructor<QBECompiler> | QBECompiler)[]
  >()
  #counter = 0

  constructor(private readonly parent: QBEEnv | null = null) {}

  get #isGlobal() {
    return this.parent === null
  }

  get slots() {
    return this.#vars
      .values()
      .flatMap((xs) => xs.filter((x) => x instanceof Slot))
      .map((slot) => slot.ptr)
      .toArray()
  }

  genId() {
    return `${this.#isGlobal ? '$' : '%'}v_${this.#counter++}`
  }

  defineUnit(name: string, constructor: UnitConstructor<QBECompiler>) {
    this.#vars.set(name, [constructor])
  }

  defineTemp() {
    return `%t_${this.#counter++}`
  }

  defineVar(name: string) {
    const id = this.genId()
    this.#vars.getOrInsert(name, []).push(id)
    return id
  }

  defineSlot(name: string) {
    if (this.#isGlobal) {
      throw Error('QBEEnv: cannot define slot in global environment')
    }
    const id = this.genId()
    this.#vars.getOrInsert(name, []).push(new Slot(id))
    return id
  }

  defineBlock() {
    return `@b_${this.#counter++}`
  }

  defineVarUnit(name: string, unit: QBECompiler) {
    this.#vars.set(name, [unit])
  }

  lookup(name: string): string | Slot | QBECompiler {
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

  has(name: string): boolean {
    return this.#vars.has(name) || (this.parent?.has(name) ?? false)
  }
}

export class Slot {
  constructor(public ptr: string) {}
}
