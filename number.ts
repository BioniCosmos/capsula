import type { Expr } from './types'

export function add(self: Expr, rhs: Expr): Expr {
  if (self.type !== 'num') {
    throw Error(`calling \`add\`: expecting number, found \`${self.type}\``)
  }
  if (rhs.type !== 'num') {
    throw Error(`calling \`add\`: expecting number, found \`${rhs.type}\``)
  }
  return { type: 'num', value: self.value + rhs.value }
}
