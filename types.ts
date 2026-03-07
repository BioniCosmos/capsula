export type Expr =
  | { type: 'bool'; value: 'true' | 'false' }
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'sym'; value: string }
  | SExpr
  | ({ type: 'fn' } & Fn)
  | { type: 'quote' }
  | { type: 'def' }
  | { type: 'lambda' }
  | { type: 'cond' }
  | { type: 'and' }
  | { type: 'or' }

export type SExpr = {
  type: 'sexpr'
  value: Expr[]
  // AST fields
  parent: SExpr | null
}

export type Fn =
  | { fnType: 'source'; env: Environment; body: Expr[] }
  | { fnType: 'native'; body: () => Expr }

export class Environment {
  readonly #vars = new Map<string, Expr>()

  constructor(private readonly parent: Environment | null = null) {}

  define(name: string, value: Expr) {
    this.#vars.set(name, value)
  }

  lookup(name: string): Expr {
    if (this.#vars.has(name)) {
      return this.#vars.get(name)!
    }

    if (this.parent) {
      return this.parent.lookup(name)
    }

    throw Error(`Undefined variable: ${name}`)
  }
}
