import { Environment } from './env'
import { Fn, SourceFn, type Params } from './fn'
import { isList, type List } from './list'
import { isNumber } from './number'
import { car, cdr, isPair } from './pair'
import { parse } from './parser'
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
    } else if (params !== null) {
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

class SetVar extends Raw implements Box {
  type = 'set!'

  override eval(exprs: List, env: Environment): Var {
    if (isNil(exprs)) {
      throw Error(`evaluating \`set!\`: missing arguments`)
    }
    const name = car(exprs)
    if (!isSymbol(name)) {
      throw Error(
        `evaluating \`set!\`: expecting \`symbol\`, found \`${typeOf(name)}\``,
      )
    }
    exprs = cdr(exprs) as List
    if (isNil(exprs)) {
      throw Error(`evaluating \`set!\`: missing arguments`)
    }
    const value = car(exprs)
    env.set(name.value, value)
    return null
  }
}

export function baseInit(env: Environment) {
  env.define('def', new Def())
  env.define('cond', new Cond())
  env.define('lambda', new Lambda())
}

export function init(
  env: Environment,
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
