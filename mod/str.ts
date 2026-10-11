import { QBEBackend } from '@/backend'
import { qbeBox, qbeSegment } from '@/type'
import type { Module } from '.'

export default {
  name: 'string',
  dependencies: [],
  units: {},
  prelude: '',
} satisfies Module

declare module '@/backend' {
  interface QBEBackend {
    buildString(raw: string): string
  }
}

const encoder = new TextEncoder()

QBEBackend.prototype.buildString = function (raw) {
  const s = this.env.defineTemp()
  this.emitGlobal(`data ${s} = {
  h ${qbeBox.str},
  h ${qbeSegment.data},
  w 0,
  l ${encoder.encode(raw).byteLength},
  b "${raw}",
}`)
  return s
}
