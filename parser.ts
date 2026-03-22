import { cons } from './pair'
import { Sym, type SExpr } from './types'

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export function parse(input: string) {
  const exprs = Array.of<SExpr[]>([])
  const stops = Array.of<number>(0)

  function push(expr: SExpr) {
    exprs.at(-1)!.push(expr)
  }

  let i = 0
  while (i < input.length) {
    switch (input[i]) {
      // Using tab is prohibited in source code.
      case '\t':
        throw Error('parser: expecting valid source code, found tab `\t`')
      // skip delimiters
      case ' ':
      case '\n':
        i++
        break
      // comment
      case ';':
        while (i < input.length && input[i] !== '\n') {
          i++
        }
        i++
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
          if (input[j] === ')' || input[j] === '\n') {
            throw Error(`parsing string: unexpected delimiter \`${input[j]}\``)
          }
          escaped = input[j] === '\\' && !escaped
          j++
        }
        if (input[j] !== '"') {
          throw Error('parsing string: expected `"`, found EOF')
        }
        push(input.slice(i + 1, j))
        i = j + 1
        break
      }
      // S-expression
      case '(': {
        exprs.push([])
        stops.push(0)
        i++
        break
      }
      case ')': {
        if (exprs.length === 1) {
          throw Error('parsing: unexpected `)`')
        }
        const currentLevel = exprs.pop()!
        const lastIndex = stops.pop()!
        if (lastIndex !== 0) {
          if (currentLevel.length - 1 !== lastIndex) {
            throw Error('parsing: unexpected expressions after `.`')
          }
          push(currentLevel.reduceRight((acc, x) => cons(x, acc)))
        } else {
          push(currentLevel.reduceRight((acc, x) => cons(x, acc), null))
        }
        i++
        break
      }
      // cons cell
      // @ts-ignore
      case '.': {
        // `(a . b)`, `(a ."b")`, `(a .(b))`, `(a .\nb)` and `(a .; comments\nb)` are supported.
        // `.` on top or `(. b)` or `(a . b . c)` are wrong.
        const legal = [' ', '\n', '(', '"', ';']
        if (legal.includes(input[i + 1])) {
          if (exprs.length === 1 || exprs.at(-1)!.length === 0) {
            throw Error('parsing: unexpected `.`')
          }
          const lastIndex = stops.length - 1
          if (stops[lastIndex] !== 0) {
            throw Error('parsing: unexpected `.`')
          }
          // record the last element index in `exprs`
          stops[lastIndex] = exprs.at(-1)!.length
          i++
          break
        }
        const illegal = [...digits, '\t', ')', '[', ']', '{', '}', `'`]
        if (illegal.includes(input[i + 1])) {
          throw Error(`parsing: unexpected \`${input[i + 1]}\``)
        }
        // fallthrough to symbol parsing
      }
      // reserved keywords
      case '[':
      case ']':
      case '{':
      case '{':
      case `'`:
        throw Error(`parsing: unexpected \`${input[i]}\``)
      default: {
        // boolean
        if (input.slice(i, i + 4) === 'true') {
          push(true)
          i += 4
          break
        }
        if (input.slice(i, i + 5) === 'false') {
          push(false)
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
            if (prev === '.' || prev === '-') {
              if (!digits.includes(input[j])) {
                throw Error(
                  `parsing number: expecting digit, found \`${input[j]}\``,
                )
              }
            } else {
              if (!digits.includes(input[j]) && input[j] !== '.') {
                throw Error(
                  `parsing number: expecting digit or \`.\`, found \`${input[j]}\``,
                )
              }
            }
            prev = input[j]
            j++
          }
          // `-` is a negative sign in the context.
          if (prev !== '-') {
            if (!digits.includes(prev)) {
              throw Error(
                `parsing number: The last character of a number should always be a digit. Found \`${prev}\`.`,
              )
            }
            push(Number(input.slice(i, j)))
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
        push(new Sym(input.slice(i, j)))
        i = j
      }
    }
  }

  if (exprs.length !== 1) {
    throw Error('parsing: expected `)`, found EOF')
  }

  return exprs[0]
}
