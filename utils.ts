import { exit } from 'node:process'
import type { Environment } from './env'
import type { ASTMeta, ASTNode, SExprSym, Unit } from './type'

export function error(meta: ASTMeta, message: string): never {
  console.error(`${meta.fileName}:${meta.line}:${meta.column} ${message}`)
  exit(1)
}

export function mustLookup<R, U extends Unit>(
  { expr, meta }: ASTNode<SExprSym>,
  env: Environment<U, R>,
) {
  const x = env.lookup(expr.value)
  if (x === null) {
    error(meta, 'compiling: unbound identifier')
  }
  return x as R | U
}
