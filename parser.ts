import { exit } from 'node:process'
import type { ASTMeta, ASTNode, SExpr, SExprCell } from './type'

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export function parse(input: string, fileName = '-'): ASTNode[] {
  let i = 0
  let line = 1
  let lineStart = 0

  function defaultNode(): ASTNode {
    return {
      expr: { type: 'cell', car: [], cdr: null },
      meta: { fileName, line, column: i - lineStart + 1 },
    }
  }
  const defaultCellState = 'car'
  const nodes: ASTNode[] = [defaultNode()]
  const cellStates: ('car' | 'dot' | 'cdr')[] = [defaultCellState]

  function defaultMeta(): ASTMeta {
    return { fileName, line, column: i - lineStart + 1 }
  }

  function parseError(message: string, meta?: Partial<ASTMeta>): never {
    const { fileName, line, column } = { ...defaultMeta(), ...meta }
    console.error(`${fileName}:${line}:${column} parsing: ${message}`)
    exit(1)
  }

  function push(expr: SExpr, meta?: Partial<ASTMeta>) {
    const cell = nodes.at(-1)!.expr as SExprCell
    const node = { expr, meta: { ...defaultMeta(), ...meta } }
    switch (cellStates.at(-1)) {
      case 'car':
        cell.car.push(node)
        break
      case 'dot':
        cell.cdr = node
        cellStates[cellStates.length - 1] = 'cdr'
        break
      case 'cdr':
        parseError(
          'Too many expressions after `.`. Only one expression is allowed on `cdr`.',
        )
    }
  }

  while (i < input.length) {
    switch (input[i]) {
      case '\t':
        parseError('Tab `\\t` is prohibited.')
      // skip delimiters
      case ' ':
        i++
        break
      case '\n':
        i++
        line++
        lineStart = i
        break
      // comment
      case ';':
        while (i < input.length && input[i] !== '\n') {
          i++
        }
        i++
        line++
        lineStart = i
        break
      // string
      // TODO: support string interpolation?
      case '"': {
        let j = i + 1
        let escaped = false
        while (j < input.length) {
          if (input[j] === '"' && !escaped) {
            break
          }
          if (input[j] === '\n') {
            parseError('Multi-line string is unsupported.')
          }
          escaped = input[j] === '\\' && !escaped
          j++
        }
        if (input[j] !== '"') {
          parseError('unterminated string', { column: j - lineStart + 1 })
        }
        push({ type: 'str', value: input.slice(i + 1, j) })
        i = j + 1
        break
      }
      // S-expression
      case '(': {
        nodes.push(defaultNode())
        cellStates.push(defaultCellState)
        i++
        break
      }
      case ')': {
        if (nodes.length === 1) {
          parseError('unexpected `)`')
        }
        if (cellStates.pop() === 'dot') {
          parseError('missing `cdr` in cell')
        }

        const { expr, meta } = nodes.pop()!
        const cell = expr as SExprCell
        const cdr = cell.cdr?.expr
        if (cdr?.type === 'cell') {
          cell.car = [...cell.car, ...cdr.car]
          cell.cdr = cdr.cdr
        }
        push(cell, meta)

        i++
        break
      }
      // cons cell
      case '.': {
        if (nodes.length === 1) {
          parseError('Unexpected `.` found. `.` should be used in cell.')
        }
        if ((nodes.at(-1)!.expr as SExprCell).car.length === 0) {
          parseError('missing `car` in cell')
        }

        const lastIndex = cellStates.length - 1
        if (cellStates[lastIndex] !== 'car') {
          parseError('unexpected `.`')
        }
        cellStates[lastIndex] = 'dot'

        i++
        break
      }
      // reserved keywords
      case '[':
      case ']':
      case '{':
      case '{':
      case `'`:
        parseError(`\`${input[i]}\` is reserved keyword.`)
      default: {
        // boolean
        if (input.slice(i, i + 4) === 'true') {
          push({ type: 'bool', value: true })
          i += 4
          break
        }
        if (input.slice(i, i + 5) === 'false') {
          push({ type: 'bool', value: false })
          i += 5
          break
        }
        // number
        // TODO: support binary, octonary and hexadecimal
        if (digits.includes(input[i]) || input[i] === '-') {
          let j = i + 1
          let prev = input[i]
          // If the current is digit, the next should be
          //
          // - digit
          // - `.`
          // - delimiter
          //
          // if the current is `-` or `.`, the next must be a digit.
          while (
            j < input.length &&
            input[j] !== ' ' &&
            input[j] !== ')' &&
            input[j] !== '\n'
          ) {
            if (
              !digits.includes(input[j]) &&
              (input[j] !== '.' || prev === '.' || prev === '-')
            ) {
              parseError('invalid character found while parsing number', {
                column: j - lineStart + 1,
              })
            }
            prev = input[j]
            j++
          }
          // `-` is a negative sign in the context.
          if (prev !== '-') {
            if (!digits.includes(prev)) {
              parseError(
                'The last character of a number should always be a digit.',
                { column: j - lineStart + 1 },
              )
            }
            push({ type: 'num', value: Number(input.slice(i, j)) })
            i = j
            break
          }
        }
        // symbol
        let j = i + 1
        const delimiters = [
          ' ',
          '(',
          ')',
          '[',
          ']',
          '{',
          '}',
          '\n',
          '"',
          '\t',
          `'`,
          ';',
        ]
        while (j < input.length && !delimiters.includes(input[j])) {
          j++
        }
        push({ type: 'sym', value: input.slice(i, j) })
        i = j
      }
    }
  }

  if (nodes.length !== 1) {
    parseError('expecting `)`, found `EOF`')
  }

  return (nodes[0].expr as SExprCell).car
}
