import { dlopen, FFIType, suffix } from 'bun:ffi'
import { env } from './env'
import { isList, type List } from './list'
import { evaluate } from './native'
import { isNumber } from './number'
import { car, cdr } from './pair'
import { isNil, isSymbol, typeOf, type SExpr } from './types'

interface Backend<T> {
  compile(source: SExpr[]): T
  execute(artifact: T): void
}

export class TreeWalk implements Backend<SExpr[]> {
  compile(source: SExpr[]): SExpr[] {
    return source
  }

  execute(artifact: SExpr[]): void {
    for (const expr of artifact) {
      evaluate(expr, env)
    }
  }
}

export class BytecodeVM implements Backend<[Uint8Array, number]> {
  compile(source: SExpr[]): [Uint8Array, number] {
    const bytecode = new ArrayBuffer(1024)
    const view = new DataView(bytecode)
    let i = 0
    for (const expr of source) {
      if (isList(expr) && !isNil(expr)) {
        let exprs = expr

        const sym = car(exprs)
        if (!isSymbol(sym)) {
          throw Error(`compiling: expecting symbol, found \`${typeOf(sym)}\``)
        }
        if (sym.value === '+') {
          view.setUint8(i++, 0)
        }

        let tail = cdr(exprs) as List
        if (isNil(tail)) {
          throw Error(`compiling: missing arguments`)
        }
        exprs = tail

        const lhs = car(exprs)
        if (!isNumber(lhs)) {
          throw Error(`compiling: expecting number, found \`${typeOf(lhs)}\``)
        }
        view.setBigInt64(i, BigInt(lhs), true)
        i += 8

        tail = cdr(exprs) as List
        if (isNil(tail)) {
          throw Error(`compiling: missing arguments`)
        }
        exprs = tail

        const rhs = car(exprs)
        if (!isNumber(rhs)) {
          throw Error(`compiling: expecting number, found \`${typeOf(rhs)}\``)
        }
        view.setBigInt64(i, BigInt(rhs), true)
        i += 8
      }
    }
    return [new Uint8Array(bytecode), i]
  }

  execute(artifact: [Uint8Array, number]): void {
    const lib = dlopen(`vm/libroot.${suffix}`, {
      execute: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.void },
    })
    lib.symbols.execute(...artifact)
  }
}
