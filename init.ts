import { init as coroutineInit } from './coroutine'
import type { TreeWalk } from './env'
import { init as listInit } from './list'
import { baseInit, evaluate, init as nativeInit } from './native'
import { init as numberInit } from './number'
import { init as pairInit } from './pair'
import { parse } from './parser'
import { init as stringInit } from './string'
import { init as traitInit } from './trait'
import { init as typesInit } from './types'

export async function init(env: TreeWalk.Environment) {
  const { nativeFn } = await import('./fn')
  baseInit(env)
  typesInit(env, nativeFn)
  traitInit(env, parse, evaluate)
  coroutineInit(env)
  numberInit(env, nativeFn)
  stringInit(env, nativeFn, parse, evaluate)
  pairInit(env, nativeFn)
  listInit(env, nativeFn)
  nativeInit(env, nativeFn)
}
