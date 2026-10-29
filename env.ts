import type { Unit, UnitClass } from './type'

export interface Environment<R = unknown> {
  defineUnit(name: string, constructor: UnitClass): void
  defineVarUnit(name: string, unit: Unit): void
  lookup(name: string): R | Unit | null

  readonly struct: StructState
}

export type StructState = { idCounter: number; meta: StructMeta[] }
export type StructMeta = { name: string; fields: string[] }

export class BytecodeEnv implements Environment<number> {
  readonly #vars = new Map<string, number | Unit | UnitClass>()
  sp: number | null

  readonly struct: StructState = { idCounter: 0, meta: [] }

  constructor(
    private readonly parent: BytecodeEnv | null = null,
    isFnScope = false,
  ) {
    this.sp = isFnScope ? 0 : null
  }

  defineUnit(name: string, constructor: UnitClass) {
    this.#vars.set(name, constructor)
  }

  defineVarUnit(name: string, unit: Unit) {
    this.#vars.set(name, unit)
  }

  defineVar(name: string) {
    const addr = this.#updateSP((sp) => sp + 1)
    this.#vars.set(name, addr)
    return addr
  }

  defineTemp() {
    return this.#updateSP((sp) => sp + 1)
  }

  lookup(name: string): number | Unit | null {
    if (this.#vars.has(name)) {
      const item = this.#vars.get(name)!
      if (typeof item === 'function') {
        return new item()
      }
      return item
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    return null
  }

  #updateSP(updater: (newSP: number) => number): number {
    if (this.sp !== null) {
      const old = this.sp
      this.sp = updater(old)
      return old
    }
    return this.parent!.#updateSP(updater)
  }
}

export class QBEEnv implements Environment<string> {
  readonly #vars = new Map<string, (string | Unit | UnitClass)[]>()
  #counter: number | null
  #subScopes: QBEEnv[] | null

  readonly struct: StructState = { idCounter: 0, meta: [] }

  constructor(
    private readonly parent: QBEEnv | null = null,
    isFnScope = false,
  ) {
    if (!isFnScope && parent !== null) {
      this.#counter = null
      this.#subScopes = null
      parent.#linkSubScope(this)
    } else {
      this.#counter = 0
      this.#subScopes = []
    }
  }

  get #isGlobal() {
    return this.parent === null
  }

  get slots() {
    return this.#vars
      .values()
      .flatMap((xs) => xs.filter((x) => typeof x === 'string'))
      .toArray()
  }

  defineUnit(name: string, constructor: UnitClass) {
    this.#vars.set(name, [constructor])
  }

  defineVarUnit(name: string, unit: Unit) {
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
    return `@b_${this.#updateCount((count) => count + 1)}`
  }

  lookup(name: string): string | Unit | null {
    if (this.#vars.has(name)) {
      const item = this.#vars.get(name)!.at(-1)!
      if (typeof item === 'function') {
        return new item()
      }
      return item
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    return null
  }

  genId(prefix: 't' | 'v') {
    return `${this.#isGlobal ? '$' : '%'}${prefix}_${this.#updateCount((count) => count + 1)}`
  }

  #updateCount(updater: (newCount: number) => number): number {
    if (this.#counter !== null) {
      const old = this.#counter
      this.#counter = updater(old)
      return old
    }
    return this.parent!.#updateCount(updater)
  }

  #linkSubScope(scope: QBEEnv) {
    if (this.#subScopes !== null) {
      this.#subScopes.push(scope)
      return
    }
    this.parent!.#linkSubScope(scope)
  }
}
