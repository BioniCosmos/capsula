import { exit } from 'node:process'
import type { ASTMeta } from './type'

export function error(meta: ASTMeta, message: string): never {
  console.error(`${meta.fileName}:${meta.line}:${meta.column} ${message}`)
  exit(1)
}
