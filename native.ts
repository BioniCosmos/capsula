import { env, Environment } from './env'
import { Fn, nativeFn, SourceFn, type Params } from './fn'
import { isList, type List } from './list'
import { isNumber, add as numAdd } from './number'
import { car, cdr, isPair } from './pair'
import { isString } from './string'
import { TraitValue } from './trait'
import {
  isBoolean,
  isNil,
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
