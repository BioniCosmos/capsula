import {
  CString,
  dlopen,
  FFIType,
  suffix,
  type ConvertFns,
  type Library,
  type Pointer,
} from 'bun:ffi'
import { isNumber } from './number'
import { isBoolean, type Var } from './type'

const symbols = {
  init: { returns: FFIType.ptr },
  deinit: { args: [FFIType.ptr] },
  err: { args: [FFIType.ptr], returns: FFIType.cstring },
  addBool: { args: [FFIType.ptr, FFIType.bool], returns: FFIType.u16 },
  addI64: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.u16 },
  execute: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64],
    returns: FFIType.ptr,
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
    let result: number
    if (isNumber(variable) && Number.isInteger(variable)) {
      result = this.#symbols.addI64(this.#vm, variable)
    } else if (isBoolean(variable)) {
      result = this.#symbols.addBool(this.#vm, variable)
    } else {
      throw Error('TODO: unsupported type')
    }
    if (result === 65535) {
      throw Error(this.#err)
    }
    return result
  }

  execute(bytecode: Uint8Array) {
    const result = this.#symbols.execute(this.#vm, bytecode, bytecode.length)
    if (result === null) {
      throw Error(this.#err)
    }
    return new CString(result).toString()
  }
}
