import { env, Environment } from './env'
import { add as numAdd } from './number'
import { type Expr } from './types'

export const dispatcher: Map<string, Map<Expr['type'], Function>> = new Map([
  ['+', new Map([['num', numAdd]])],
])

export function evaluate(expr: Expr, env: Environment): Expr {
  switch (expr.type) {
    case 'nil':
    case 'bool':
    case 'num':
    case 'str':
      return expr
    case 'sym':
      return env.lookup(expr.value)
    case 'sexpr':
      if (expr.value.length === 0) {
        throw Error('evaluating S-expression: empty')
      }
      const fn = evaluate(expr.value[0], env)
      if (fn.type !== 'fn') {
        throw Error(
          `evaluating S-expression: expecting function, found \`${fn.type}\``,
        )
      }
      const args = expr.value.slice(1).map((arg) => evaluate(arg, env))
      switch (fn.fnType) {
        // TODO: support `.`
        case 'source': {
          const env = new Environment(fn.env)
          for (const [i, param] of fn.params.entries()) {
            const arg = args.at(i)
            if (!arg) {
              throw Error('calling function: missing arguments')
            }
            env.define(param, arg)
          }
          let result: Expr = { type: 'nil' }
          for (const expr of fn.body) {
            result = evaluate(expr, env)
          }
          return result
        }
        case 'native': {
          return fn.body(...args)
        }
      }
    default:
      throw Error('unimplemented')
  }
}

env.define('+', {
  type: 'fn',
  fnType: 'native',
  body: (...xs) => {
    const fn = dispatcher.get('+')?.get(xs[0].type)
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
  },
})
