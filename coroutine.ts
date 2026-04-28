import { TreeWalk } from './env'
import type { Fn, SourceFn } from './fn'
import { iter, next, type List } from './list'
import { evaluate, Lambda } from './native'
import {
  typeOf,
  type Box,
  type SExpr,
  type TreeWalkEvaluator,
  type Var,
} from './types'

class Co implements Box, TreeWalkEvaluator {
  type = 'co'

  pc = 0
  fn: SourceFn | null = null
  env: TreeWalk.Environment | null = null

  eval(exprs: List, env: TreeWalk.Environment): Var {
    this.fn = (new Lambda().eval(exprs, env) as Fn).value as SourceFn
    this.env = new TreeWalk.Environment(env)
    return this
  }

  run() {
    if (this.fn === null || this.env === null) {
      throw Error('unreachable')
    }
    while (this.pc < this.fn.body.length) {
      const result = evaluate(this.fn.body[this.pc], this.env)
      this.pc++
      if (result instanceof SwitchSignal) {
        return result
      }
    }
  }
}

class Yield implements Box, TreeWalkEvaluator {
  type = 'yield'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    const co = evaluate(next(iter(exprs), 'yield') as SExpr, env)
    if (!(co instanceof Co)) {
      throw Error(
        `evaluating \`yield\`: expecting coroutine, found \`${typeOf(co)}\``,
      )
    }
    return new SwitchSignal(co)
  }
}

class Start implements Box, TreeWalkEvaluator {
  type = 'start'

  eval(exprs: List, env: TreeWalk.Environment): Var {
    let co = evaluate(next(iter(exprs), 'start') as SExpr, env)
    if (!(co instanceof Co)) {
      throw Error(
        `evaluating \`start\`: expecting coroutine, found \`${typeOf(co)}\``,
      )
    }
    while (co !== null) {
      let currentCo = co as Co
      co = null
      const result = currentCo.run()
      if (result instanceof SwitchSignal) {
        co = result.co
      }
    }
    return null
  }
}

class SwitchSignal implements Box {
  type = 'switch-signal'

  constructor(public co: Co) {}
}

export function init(env: TreeWalk.Environment) {
  env.define('co', () => new Co())
  env.define('yield', new Yield())
  env.define('start', new Start())
}
