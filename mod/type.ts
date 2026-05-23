import { QBEBackend } from '@/backend'
import type { QBE } from '@/env'

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
