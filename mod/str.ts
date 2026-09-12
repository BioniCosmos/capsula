import { QBEBackend } from '@/backend'
import type { QBEEnv } from '@/env'
import type { Module } from '.'

export default {
  name: 'string',
  dependencies: [],
  units: {},
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    buildString(raw: string, env: QBEEnv): string
  }
}

QBEBackend.prototype.buildString = function (raw, env) {
  const s = this.env.defineTemp()
  this.emitGlobal(`data ${s} = { b "${raw}" }`)

  const x = env.defineTemp()
  this.emit(`${x} =l alloc8 24`)

  this.emit(`storel 2, ${x}`)

  const p = env.defineTemp()
  this.emit(`${p} =l add ${x}, 8`)
  this.emit(`storel ${new TextEncoder().encode(raw).byteLength}, ${p}`)

  this.emit(`${p} =l add ${x}, 16`)
  this.emit(`storel ${s}, ${p}`)

  return this.wrapArray(x, env)
}
