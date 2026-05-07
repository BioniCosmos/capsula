export const Instruction = {
  Add: { type: 'Add' },
  Sub: { type: 'Sub' },
  Mul: { type: 'Mul' },
  Push: (addr: number) => ({ type: 'Push', addr }) as const,
  Load: (addr: number) => ({ type: 'Load', addr }) as const,
  Save: (addr: number) => ({ type: 'Save', addr }) as const,
} as const

type GetValueOrReturnValue<T> = T extends (...args: any[]) => infer R ? R : T

export type Instruction = GetValueOrReturnValue<
  (typeof Instruction)[keyof typeof Instruction]
>

export function length(bytecode: Instruction[]) {
  let len = 0
  for (const code of bytecode) {
    if (typeof code === 'number') {
      len += 2
    } else {
      if (
        code.type === 'Push' ||
        code.type === 'Load' ||
        code.type === 'Save'
      ) {
        len += 3
      } else {
        len += 1
      }
    }
  }
  return len
}

export function serialize(bytecode: Instruction[]) {
  let buf = new ArrayBuffer(length(bytecode))
  let view = new DataView(buf)
  let i = 0
  for (const code of bytecode) {
    if (typeof code === 'number') {
      view.setUint16(i, code, true)
      i += 2
    } else {
      view.setUint8(i++, serializeCmd.get(code.type)!)
      if (
        code.type === 'Push' ||
        code.type === 'Load' ||
        code.type === 'Save'
      ) {
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
