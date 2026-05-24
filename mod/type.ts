import { QBEBackend } from '@/backend'
import type { QBE } from '@/env'
import type { Module } from '.'

export default {
  name: 'type',
  dependencies: [],
  units: {},
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    tag(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.tag = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l and ${x}, ${0b111}`)
  return result
}
