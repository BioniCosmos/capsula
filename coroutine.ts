import { Environment } from './env'
import type { Fn, SourceFn } from './fn'
import type { List } from './list'
import { evaluate, Lambda } from './native'
import { car } from './pair'
import { Raw, typeOf, type Box, type SExpr, type Var } from './types'

class Co extends Raw implements Box {
  type = 'co'

  pc = 0
  fn: SourceFn | null = null
  env: Environment | null = null

  override eval(exprs: List, env: Environment): Var {
    this.fn = (new Lambda().eval(exprs, env) as Fn).value as SourceFn
    this.env = new Environment(env)
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

class Yield extends Raw implements Box {
  type = 'yield'

  override eval(exprs: List, env: Environment): Var {
    const co = evaluate(car(exprs) as SExpr, env)
    if (!(co instanceof Co)) {
      throw Error(
        `evaluating \`yield\`: expecting coroutine, found \`${typeOf(co)}\``,
      )
    }
    return new SwitchSignal(co)
  }
}

class Start extends Raw implements Box {
  type = 'start'

  override eval(exprs: List, env: Environment): Var {
    let co = evaluate(car(exprs) as SExpr, env)
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

export function init(env: Environment) {
  env.define('co', () => new Co())
  env.define('yield', new Yield())
  env.define('start', new Start())
}
