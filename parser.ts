import type { Expr, SExpr } from './types'

export function parse(input: string) {
  const exprs = Array.of<Expr>()
  let top: SExpr | null = null

  function push(expr: Expr) {
    if (top !== null) {
      top.value.push(expr)
    } else {
      exprs.push(expr)
    }
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
        push({ type: 'str', value: input.slice(i + 1, j) })
        i = j + 1
        break
      }
      // S-expression
      case '(': {
        const newSExpr: Expr = { type: 'sexpr', value: [], parent: top }
        push(newSExpr)
        top = newSExpr
        i++
        break
      }
      case ')': {
        if (top === null) {
          throw Error('parsing: unexpected `)`')
        }
        top = top.parent
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

  if (top !== null) {
    throw Error('parsing: expected `)`, found EOF')
  }

  return exprs
}
