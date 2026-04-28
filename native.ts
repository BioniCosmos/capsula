import type { TreeWalk } from './env'
import { Fn, SourceFn } from './fn'
import { collect, isList, iter, next, type List } from './list'
import { isNumber } from './number'
import { car, cdr } from './pair'
import { parse } from './parser'
import { isString } from './string'
import { TraitValue } from './trait'
import {
  isBoolean,
  isNil,
  isSymbol,
  isTreeWalkEvaluator,
  Sym,
  typeOf,
  type Box,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from './types'

export function evaluate(expr: SExpr, env: TreeWalk.Environment): Var {
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
  if (isTreeWalkEvaluator(box)) {
    return box.eval(cdr(expr), env)
  }
  throw Error('unreachable')
}

class Def implements Box, TreeWalkEvaluator {
  type = 'def'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    const it = iter(exprs)
    const sym = next(it, 'def')
    if (!isSymbol(sym)) {
      throw Error(
        `evaluating \`def\`: expecting symbol, found \`${typeOf(sym)}\``,
      )
    }
    env.define(sym.value, evaluate(next(it, 'def') as SExpr, env))
    return null
  }
}

// TODO: support `else`
class Cond implements Box, TreeWalkEvaluator {
  type = 'cond'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    for (const clause of iter(exprs)) {
      if (!isList(clause) || isNil(clause)) {
        throw Error(
          `evaluating \`cond\`: expecting non-empty \`list\`, found \`${typeOf(clause)}\``,
        )
      }
      const it = iter(clause)
      const condition = evaluate(next(it, 'cond') as SExpr, env)
      if (!isBoolean(condition)) {
        throw Error(
          `evaluating \`cond\`: expecting \`bool\`, found \`${typeOf(condition)}\``,
        )
      }
      if (condition) {
        const body = it.toArray()
        if (body.length === 0) {
          throw Error(`evaluating \`cond\`: missing body`)
        }
        return body.reduce((_, x) => evaluate(x as SExpr, env), null)
      }
    }
    return null
  }
}

// TODO: support optional and named parameters
export class Lambda implements Box, TreeWalkEvaluator {
  type = 'lambda'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    const it = iter(exprs)
    const [fixed, rest] = collect(iter(next(it, 'lambda')))
    if (!isSymbol(rest) && !isNil(rest)) {
      throw Error(
        `evaluating \`lambda\`: expecting \`symbol\`, found \`${typeOf(rest)}\``,
      )
    }
    const illegalOne = fixed.find((x) => !isSymbol(x))
    if (illegalOne !== undefined && fixed.length !== 0) {
      throw Error(
        `evaluating \`lambda\`: expecting \`symbol\`, found \`${typeOf(illegalOne)}\``,
      )
    }
    return new Fn(
      new SourceFn(
        env,
        { fixed: fixed.map((x) => (x as Sym).value), rest: rest?.value ?? '' },
        it.toArray() as SExpr[],
      ),
    )
  }
}

class SetVar implements Box, TreeWalkEvaluator {
  type = 'set!'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    const it = iter(exprs)
    const name = next(it, 'set!')
    if (!isSymbol(name)) {
      throw Error(
        `evaluating \`set!\`: expecting \`symbol\`, found \`${typeOf(name)}\``,
      )
    }
    env.set(name.value, next(it, 'set!'))
    return null
  }
}

export function baseInit(env: TreeWalk.Environment) {
  env.define('def', new Def())
  env.define('cond', new Cond())
  env.define('lambda', new Lambda())
}

export function init(
  env: TreeWalk.Environment,
  nativeFn: (body: (...params: Var[]) => Var) => Fn,
) {
  env.define(
    'apply',
    nativeFn((fn, args) => {
      if (!(fn instanceof Fn) && !(fn instanceof TraitValue)) {
        throw Error(
          `calling \`apply\`: expecting function, found \`${typeOf(fn)}\``,
        )
      }
      if (!isList(args)) {
        throw Error(
          `calling \`apply\`: expecting list, found \`${typeOf(args)}\``,
        )
      }
      return fn.eval(args, env)
    }),
  )

  env.define(
    '=',
    nativeFn((self, rhs) => self === rhs),
  )

  evaluate(
    parse(String.raw`
      (def + add-all)
    `)[0],
    env,
  )

  env.define(
    'print',
    nativeFn((...xs) => {
      console.log(...xs)
      return null
    }),
  )

  env.define('set!', new SetVar())
}
