import { env, Environment } from './env'
import { Fn, nativeFn, NativeFn, SourceFn, type Params } from './fn'
import { isList, type List } from './list'
import { isNumber, add as numAdd } from './number'
import { car, cdr, isPair } from './pair'
import {
  isBoolean,
  isNil,
  isString,
  isSymbol,
  Raw,
  typeOf,
  type Box,
  type SExpr,
  type Var,
} from './types'

export const dispatcher: Map<string, Map<string, Function>> = new Map([
  ['+', new Map([['num', numAdd]])],
])

export function evaluate(expr: SExpr, env: Environment): Var {
  if (isNil(expr) || isBoolean(expr) || isNumber(expr) || isString(expr)) {
    return expr
  }
  if (isSymbol(expr)) {
    return env.lookup(expr.value)
  }
  if (!isList(expr)) {
    throw Error('evaluating: expecting list, found pair')
  }
  const box = evaluate(car(expr) as SExpr, env)
  if (box instanceof Raw) {
    return box.eval(cdr(expr) as List, env)
  }
  if (!(box instanceof Fn)) {
    throw Error(`evaluating: expecting function, found \`${typeOf(box)}\``)
  }
  const { value: fn } = box
  let args = cdr(expr) as List
  if (fn instanceof SourceFn) {
    return fn.apply(args, env)
  }
  if (fn instanceof NativeFn) {
    const params = Array.of<Var>()
    while (!isNil(args)) {
      params.push(evaluate(car(args) as SExpr, env))
      args = cdr(args) as List
    }
    return fn.body(...params)
  }
  throw Error('unreachable')
}

class Def extends Raw implements Box {
  type = 'def'

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error(`evaluating \`def\`: missing arguments`)
    }
    const sym = car(exprs)
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    exprs = cdr(exprs) as List
    if (isNil(exprs)) {
      throw Error(`evaluating \`def\`: missing value`)
    }
    env.define(sym.value, evaluate(car(exprs) as SExpr, env))
    return null
  }
}

env.define('def', new Def())

// TODO: support `else`
class Cond extends Raw implements Box {
  type = 'cond'

  override eval(exprs: List, env: Environment): Var {
    let result: Var = null
    while (exprs !== null) {
      let clause = car(exprs)
      if (!isList(clause) || clause === null) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }
      const condition = evaluate(car(clause) as SExpr, env)
      if (!isBoolean(condition)) {
        throw Error(
          `evaluating \`cond\`: expecting \`bool\`, found \`${typeOf(condition)}\``,
        )
      }
      if (condition) {
        clause = cdr(clause)
        if (clause === null) {
          throw Error(`evaluating \`cond\`: missing body`)
        }
        do {
          result = evaluate(car(clause) as SExpr, env)
          clause = cdr(clause)
        } while (clause !== null)
        break
      }
      exprs = cdr(exprs) as List
    }
    return result
  }
}

env.define('cond', new Cond())

// TODO: support optional and named parameters
class Lambda extends Raw implements Box {
  type = 'lambda'

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error('evaluating `lambda`: missing arguments')
    }
    const paramDeclaration: Params = { fixed: [], rest: '' }
    let params = car(exprs)
    if (isSymbol(params)) {
      paramDeclaration.rest = params.value
    } else if (isPair(params)) {
      while (true) {
        const param = car(params)
        if (!isSymbol(param)) {
          throw Error(
            `evaluating \`lambda\`: expecting symbol, found \`${typeOf(param)}\``,
          )
        }
        paramDeclaration.fixed.push(param.value)
        const next = cdr(params)
        if (isNil(next)) {
          break
        }
        if (isSymbol(next)) {
          paramDeclaration.rest = next.value
          break
        }
        if (isPair(next)) {
          params = next
          continue
        }
        throw Error(
          `evaluating \`lambda\`: expecting symbol, found \`${typeOf(next)}\``,
        )
      }
    } else {
      throw Error('evaluating `lambda`: missing parameters')
    }
    let body = cdr(exprs)
    const bodyArray = Array.of<SExpr>()
    while (!isNil(body)) {
      bodyArray.push(car(body) as SExpr)
      body = cdr(body)
    }
    return new Fn(new SourceFn(env, paramDeclaration, bodyArray))
  }
}

env.define('lambda', new Lambda())

// TODO: stricter grammar
// TODO: support associated types, variables…
class Trait extends Raw implements Box {
  type = 'trait'

  #fns = new Map<string, SourceFn | null>()
  #implRegistry = new Map<string, Map<string, SourceFn>>()

  override eval(exprs: List, env: Environment): Var {
    const traitEnv = new Environment(env)
    while (!isNil(exprs)) {
      evaluate(car(exprs) as SExpr, traitEnv)
      exprs = cdr(exprs) as List
    }
    const fnEntries = traitEnv.locals
      .entries()
      .filter(([, v]) => v instanceof Fn && v.value instanceof SourceFn)
      .map(([k, v]): [string, SourceFn | null] => {
        const fn = (v as Fn).value as SourceFn
        if (fn.body.length === 0) {
          return [k, null]
        }
        fn.env = env
        return [k, fn]
      })
    for (const [k, v] of fnEntries) {
      this.#fns.set(k, v)
      env.define(k, new TraitValue(k, this))
    }
    return this
  }

  register(typeName: string, name: string, v: SourceFn) {
    if (!this.#implRegistry.has(typeName)) {
      this.#implRegistry.set(typeName, new Map())
    }
    this.#implRegistry.get(typeName)!.set(name, v)
  }

  findImpl(typeName: string, name: string) {
    const defaultImpl = this.#fns.get(name)
    if (defaultImpl === undefined) {
      throw Error('unreachable')
    }
    const impl = this.#implRegistry.get(typeName)?.get(name)
    if (impl !== undefined) {
      return impl
    }
    if (defaultImpl !== null) {
      return defaultImpl
    }
    throw Error(`trait dispatching: missing implementation for \`${typeName}\``)
  }

  findMissingImpls(typeName: string) {
    const traitSet = new Set(
      this.#fns
        .entries()
        .filter(([, v]) => v === null)
        .map(([k]) => k),
    )
    const implSet = new Set(this.#implRegistry.get(typeName)?.keys())
    return traitSet.difference(implSet)
  }
}

env.define('trait', new Trait())

class TraitValue extends Raw implements Box {
  type = 'trait-value'

  constructor(
    private name: string,
    private trait: Trait,
  ) {
    super()
  }

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error('evaluating `trait-value`: unsupported syntax')
    }
    return this.trait.findImpl(typeOf(car(exprs)), this.name).apply(exprs, env)
  }
}

class Impl extends Raw implements Box {
  type = 'impl'

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error('evaluating `impl`: missing trait name')
    }

    const traitName = car(exprs)
    exprs = cdr(exprs) as List
    if (isNil(exprs)) {
      throw Error('evaluating `impl`: missing target type name')
    }
    const typeName = car(exprs)
    exprs = cdr(exprs) as List

    if (!isSymbol(traitName)) {
      throw Error(
        `evaluating \`impl\`: expecting \`symbol\` for trait name, found \`${typeOf(traitName)}\``,
      )
    }
    if (!isSymbol(typeName)) {
      throw Error(
        `evaluating \`impl\`: expecting \`symbol\` for target type name, found \`${typeOf(typeName)}\``,
      )
    }

    const trait = env.lookup(traitName.value)
    if (!(trait instanceof Trait)) {
      throw Error(
        `evaluating \`impl\`: \`${traitName.value}\` is not a trait, but \`${typeOf(trait)}\`.`,
      )
    }
    const implEnv = new Environment(env)
    while (!isNil(exprs)) {
      evaluate(car(exprs) as SExpr, implEnv)
      exprs = cdr(exprs) as List
    }
    const fnEntries = implEnv.locals
      .entries()
      .filter(([, v]) => v instanceof Fn && v.value instanceof SourceFn)
      .map(([k, v]): [string, SourceFn] => {
        const fn = (v as Fn).value as SourceFn
        fn.env = env
        return [k, fn]
      })
    for (const [k, v] of fnEntries) {
      trait.register(typeName.value, k, v)
    }

    const missingImpls = trait.findMissingImpls(typeName.value)
    if (missingImpls.size !== 0) {
      throw Error(
        `evaluating \`impl\`: missing the following implementations: ${missingImpls
          .values()
          .map((k) => `\`${k}\``)
          .toArray()
          .join(', ')}`,
      )
    }

    return null
  }
}

env.define('impl', new Impl())

env.define(
  '+',
  nativeFn((...xs) => {
    const fn = dispatcher.get('+')?.get(typeOf(xs[0]))
    if (!fn) {
      throw Error('function calling dispatching: failed to find a candidate')
    }
    if (xs.length === 0) {
      return { type: 'nil' }
    }
    if (xs.length === 1) {
      return xs[0]
    }
    return xs.reduce((acc, x) => {
      return fn(acc, x)
    })
  }),
)
