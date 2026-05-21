export const Instruction = {
  Add: { type: 'Add' },
  Sub: { type: 'Sub' },
  Mul: { type: 'Mul' },
  Div: { type: 'Div' },
  Rem: { type: 'Rem' },
  Jump: (offset: number) => ({ type: 'Jump', offset }) as const,
  BEQZ: (offset: number) => ({ type: 'BEQZ', offset }) as const,
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
    if (hasParam(code)) {
      len += 3
    } else {
      len += 1
    }
  }
  return len
}

// TODO: refactor to fix the wrong offset
export function serialize(bytecode: Instruction[]) {
  let buf = new ArrayBuffer(length(bytecode))
  let view = new DataView(buf)

  let i = 0
  for (const code of bytecode) {
    view.setUint8(i++, serializeCmd.get(code.type)!)
    if (hasParam(code)) {
      if ('offset' in code) {
        view.setUint16(i, code.offset, true)
      } else if ('addr' in code) {
        view.setUint16(i, code.addr, true)
      }
      i += 2
    }
  }

  return new Uint8Array(buf)
}

export const serializeCmd = new Map(
  Object.keys(Instruction).map((k, i) => [k, i]),
)

function hasParam(instruction: Instruction) {
  return ['Jump', 'BEQZ', 'Push', 'Load', 'Save'].includes(instruction.type)
}

export type JumpableEntry = { index: number; instruction: { offset: number } }

export class Label {
  #from = Array.of<JumpableEntry>()
  target = 0

  jumpFrom(entry: JumpableEntry) {
    this.#from.push(entry)
  }

  fillOffset() {
    for (const { index: from, instruction } of this.#from) {
      instruction.offset = this.target - from
    }
  }
}
