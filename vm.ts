import {
  dlopen,
  FFIType,
  suffix,
  type ConvertFns,
  type Library,
  type Pointer,
} from 'bun:ffi'
import { isNumber } from './number'
import type { Var } from './type'

const symbols = {
  init: { returns: FFIType.ptr },
  deinit: { args: [FFIType.ptr] },
  err: { args: [FFIType.ptr], returns: FFIType.cstring },
  addI64: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.u16 },
  execute: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64],
    returns: FFIType.bool,
  },
} as const

export class VM {
  readonly #lib: Library<typeof symbols>
  readonly #symbols: ConvertFns<typeof symbols>
  readonly #vm: Pointer

  constructor() {
    this.#lib = dlopen(`vm/libroot.${suffix}`, symbols)
    this.#symbols = this.#lib.symbols

    const vm = this.#lib.symbols.init()
    if (vm === null) {
      throw Error('failed to create VM')
    }
    this.#vm = vm
  }

  [Symbol.dispose]() {
    this.#symbols.deinit(this.#vm)
    this.#lib.close()
  }

  get #err() {
    return this.#symbols.err(this.#vm).toString()
  }

  addVar(variable: Var) {
    if (isNumber(variable) && Number.isInteger(variable)) {
      const result = this.#symbols.addI64(this.#vm, variable)
      if (result === 65535) {
        throw Error(this.#err)
      }
      return result
    }
    throw Error('TODO: unsupported type')
  }

  execute(bytecode: Uint8Array) {
    if (!this.#symbols.execute(this.#vm, bytecode, bytecode.length)) {
      throw Error(this.#err)
    }
  }
}
