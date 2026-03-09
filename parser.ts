import type { List } from './list'
import { Sym, type SExpr } from './types'

export function parse(input: string) {
  const exprs = Array.of<SExpr[]>([])

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
        i++
        break
      }
      case ')': {
        if (exprs.length === 1) {
          throw Error('parsing: unexpected `)`')
        }
        const xs = exprs.pop()!
        if (xs.length === 0) {
          push(null)
        } else {
          const head: List = [xs[0], null]
          let tail: List = head
          for (const x of xs.slice(1)) {
            const node: List = [x, null]
            tail[1] = node
            tail = node
          }
          push(head)
        }
        i++
        break
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
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
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
