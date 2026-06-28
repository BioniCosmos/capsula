export const Instruction = {
  Add: { type: 'Add' },
  Sub: { type: 'Sub' },
  Mul: { type: 'Mul' },
  Div: { type: 'Div' },
  Rem: { type: 'Rem' },
  Eq: { type: 'Eq' },
  Lt: { type: 'Lt' },
  Gt: { type: 'Gt' },
  Le: { type: 'Le' },
  Ge: { type: 'Ge' },
  Push: (addr: number) => ({ type: 'Push', addr }) as const,
  Load: (addr: number) => ({ type: 'Load', addr }) as const,
  Save: (addr: number) => ({ type: 'Save', addr }) as const,
  Jump: (offset: number) => ({ type: 'Jump', offset }) as const,
  BEqZ: (offset: number) => ({ type: 'BEqZ', offset }) as const,
  IsI64: { type: 'IsI64' },
  Print: { type: 'Print' },
  ArrayNew: (len: number) => ({ type: 'ArrayNew', len }) as const,
  ArrayGet: (addr: number) => ({ type: 'ArrayGet', addr }) as const,
  ArraySet: (addr: number) => ({ type: 'ArraySet', addr }) as const,
  ArrayLen: { type: 'ArrayLen' },
  DebugArray: { type: 'DebugArray' },
} as const

type GetValueOrReturnValue<T> = T extends (...args: any[]) => infer R ? R : T

type InstructionType = keyof typeof Instruction
export type Instruction = GetValueOrReturnValue<
  (typeof Instruction)[InstructionType]
>

export class CodeBuffer {
  static readonly maxInstructionSize = 3
  static readonly maxGrowth = 1024 * 1024

  #buf = new ArrayBuffer(1024, { maxByteLength: CodeBuffer.maxGrowth })
  len = 0

  get #view() {
    return new DataView(this.#buf)
  }

  push(code: Instruction) {
    if (this.len + CodeBuffer.maxInstructionSize > this.#buf.byteLength) {
      const newLength = this.#buf.byteLength * 2
      if (newLength <= CodeBuffer.maxGrowth) {
        this.#buf.resize(newLength)
      } else {
        this.#buf = this.#buf.transferToFixedLength(newLength)
      }
    }

    const start = this.len

    this.#view.setUint8(this.len++, serializeCmd.get(code.type)!)
    switch (code.type) {
      case 'Push':
      case 'Load':
      case 'Save':
      case 'ArrayGet':
      case 'ArraySet':
        this.#view.setUint16(this.len, code.addr, true)
        this.len += 2
        break
      case 'Jump':
      case 'BEqZ':
        this.#view.setInt16(this.len, code.offset, true)
        this.len += 2
        break
      case 'ArrayNew':
        this.#view.setUint16(this.len, code.len, true)
        this.len += 2
        break
    }

    return new DataView(this.#buf, start, this.len - start)
  }

  get u8Array() {
    return new Uint8Array(this.#buf, 0, this.len)
  }

  toString() {
    const display = Array.of<string>()

    let i = 0
    while (i < this.len) {
      const type = deserializeCmd.get(this.#view.getUint8(i))
      let code = `${i}: ${type}`
      switch (type) {
        case 'Push':
        case 'Load':
        case 'Save':
        case 'ArrayGet':
        case 'ArraySet':
          code += `: addr=${this.#view.getUint16(i + 1, true)}`
          i += 2
          break
        case 'ArrayNew':
          code += `: len=${this.#view.getUint16(i + 1, true)}`
          i += 2
          break
        case 'Jump':
        case 'BEqZ':
          code += `: offset=${this.#view.getInt16(i + 1, true)}`
          i += 2
          break
      }
      display.push(code)
      i++
    }

    return display.join('\n')
  }
}

const serializeCmd = new Map(
  (Object.keys(Instruction) as InstructionType[]).map((k, i) => [k, i]),
)
const deserializeCmd = new Map(Array.from(serializeCmd, ([k, v]) => [v, k]))

export type JumpableEntry = { from: number; fill: (offset: number) => void }

export class Label {
  readonly #from = Array.of<JumpableEntry>()

  jumpFrom(entry: JumpableEntry) {
    this.#from.push(entry)
  }

  fillOffset(target: number) {
    for (const { from, fill } of this.#from) {
      fill(target - from)
    }
  }
}
