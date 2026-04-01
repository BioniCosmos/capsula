import { Environment } from './env'
import { Fn, SourceFn } from './fn'
import type { List } from './list'
import { evaluate } from './native'
import { car, cdr } from './pair'
import {
  isNil,
  isSymbol,
  Raw,
  typeOf,
  type Box,
  type SExpr,
  type Var,
} from './types'

// TODO: stricter grammar
// TODO: support associated types, variables…
export class Trait extends Raw implements Box {
  type = 'trait'

  #fns = new Map<string, SourceFn | null>()
  #implRegistry = new Map<string, Map<string, Fn>>()

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

  register(typeName: string, name: string, v: Fn) {
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
      return new Fn(defaultImpl)
    }
    throw Error(
      `trait dispatching: missing implementation for \`${typeName}\` on \`${name}\``,
    )
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

export class TraitValue extends Raw implements Box {
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
    return this.trait
      .findImpl(typeOf(evaluate(car(exprs) as SExpr, env)), this.name)
      .eval(exprs, env)
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
    implEnv.locals
      .entries()
      .filter(([, v]) => v instanceof Fn)
      .map(([k, v]): [string, Fn] => {
        const fn = v as Fn
        if (fn.value instanceof SourceFn) {
          fn.value.env = env
        }
        return [k, fn]
      })
      .forEach(([k, v]) => trait.register(typeName.value, k, v))

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

export function init(
  env: Environment,
  parse: (input: string) => SExpr[],
  evaluate: (expr: SExpr, env: Environment) => Var,
) {
  env.define('trait', () => new Trait())
  env.define('impl', new Impl())

  evaluate(
    parse(String.raw`
      (def Add (trait
        (def add (lambda (self rhs)))
        (def add-all (lambda xs
          (cond
            ((nil? xs) nil)
            ((= (length xs) 1) (car xs))
            (true (add (car xs) (apply add-all (cdr xs)))))))))
    `)[0],
    env,
  )
}
