import { QBEBackend } from '@/backend'
import type { QBE } from '@/env'

declare module '@/backend' {
  interface QBEBackend {
    wrapBool(x: string, env: QBE.Env): string
  }
}

QBEBackend.prototype.wrapBool = function (x, env) {
  const result = env.defineTemp()
  this.emit(`${result} =l shl ${x}, 3`)
  this.emit(`${result} =l or ${result}, 1`)
  return result
}
