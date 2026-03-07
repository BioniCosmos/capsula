import type { Environment } from './env'

export type Expr =
  | { type: 'nil' }
  | { type: 'bool'; value: boolean }
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'sym'; value: string }
  | SExpr
  | ({ type: 'fn' } & (
      | SourceFn
      | { fnType: 'native'; body: (...params: Expr[]) => Expr }
    ))
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

type SourceFn = {
  fnType: 'source'
  env: Environment
  params: string[]
  body: Expr[]
}
