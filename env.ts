import {
  isUnitConstructor,
  type BytecodeCompiler,
  type QBECompiler,
  type Unit,
  type UnitConstructor,
} from './type'

export interface Environment<T extends Unit = Unit, R = unknown> {
  defineUnit(name: string, constructor: UnitConstructor<T>): void
  lookup(name: string): R | T | null
}

export class BytecodeEnv implements Environment<BytecodeCompiler, number> {
  readonly #vars = new Map<
    string,
    number | UnitConstructor<BytecodeCompiler> | BytecodeCompiler
  >()
  sp: number | null

  constructor(
    private readonly parent: BytecodeEnv | null = null,
    isFnScope = false,
  ) {
    this.sp = isFnScope ? 0 : null
  }

  defineUnit(name: string, constructor: UnitConstructor<BytecodeCompiler>) {
    this.#vars.set(name, constructor)
  }

  defineVarUnit(name: string, unit: BytecodeCompiler) {
    this.#vars.set(name, unit)
  }

  defineVar(name: string) {
    const addr = this.#updateSP((sp) => sp + 1)
    this.#vars.set(name, addr)
    return addr
  }

  lookup(name: string): number | BytecodeCompiler | null {
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

// TODO: Distinguish the identifier of the builtin and the external.
export class QBEEnv implements Environment<QBECompiler, string> {
  readonly #vars = new Map<
    string,
    (string | UnitConstructor<QBECompiler> | QBECompiler)[]
  >()
  #counter: number | null
  #subScopes: QBEEnv[] | null

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
    return `@b_${this.#updateCount((count) => count + 1)}`
  }

  lookup(name: string): string | QBECompiler | null {
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
