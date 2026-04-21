export const Instruction = {
  Add: { type: 'Add' },
  Push: (addr: number) => ({ type: 'Push', addr }) as const,
  Load: { type: 'Load' },
} as const

type GetValueOrReturnValue<T> = T extends (...args: any[]) => infer R ? R : T

export type Instruction = GetValueOrReturnValue<
  (typeof Instruction)[keyof typeof Instruction]
>

export type Bytecode = Instruction | number

export function length(bytecode: Bytecode[]) {
  let len = 0
  for (const code of bytecode) {
    if (typeof code === 'number') {
      len += 2
    } else {
      if (code.type === 'Push') {
        len += 3
      } else {
        len += 1
      }
    }
  }
  return len
}

export function serialize(bytecode: Bytecode[]) {
  let buf = new ArrayBuffer(length(bytecode))
  let view = new DataView(buf)
  let i = 0
  for (const code of bytecode) {
    if (typeof code === 'number') {
      view.setUint16(i, code, true)
      i += 2
    } else {
      view.setUint8(i++, serializeCmd.get(code.type)!)
      if (code.type === 'Push') {
        view.setUint16(i, code.addr, true)
        i += 2
      }
    }
  }
  return new Uint8Array(buf)
}

export const serializeCmd = new Map(
  Object.keys(Instruction).map((k, i) => [k, i]),
)
