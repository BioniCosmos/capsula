import type { Backend } from '@/backend'
import { unitConstructor, type UnitClass } from '@/type'

export type Module = {
  name: string
  dependencies: string[]
  units: Record<string, UnitClass>
  prelude: string
}

export async function init(ctx: Backend) {
  const moduleRegistry = new Map<string, Module>()
  function registerModule(mod: Module) {
    moduleRegistry.set(mod.name, mod)
  }

  const sources = [
    './core',
    './type',
    './bool',
    './int',
    './array',
    './struct',
    './fn',
    './mem',
    './io',
  ]
  for (const source of sources) {
    registerModule((await import(source)).default)
  }

  const initOrder = resolveOrder(moduleRegistry)
  for (const modName of initOrder) {
    const mod = moduleRegistry.get(modName)!
    for (const [name, Unit] of Object.entries(mod.units)) {
      ctx.env.defineUnit(name, unitConstructor(Unit))
    }
    // TODO: prelude
  }
}

function resolveOrder(mods: ReadonlyMap<string, Module>) {
  const inDegree = new Map(mods.keys().map((mod) => [mod, 0]))
  for (const mod of mods.values()) {
    for (const dep of mod.dependencies) {
      if (!inDegree.has(dep)) {
        throw Error(`unknown module: ${dep}`)
      }
      inDegree.set(dep, inDegree.get(dep)! + 1)
    }
  }

  const wave = inDegree
    .entries()
    .filter(([, v]) => v === 0)
    .map(([k]) => k)
    .toArray()
  const result = Array.of<string>()
  while (wave.length > 0) {
    const modName = wave.shift()!
    result.push(modName)

    for (const dep of mods.get(modName)!.dependencies) {
      const newInDegree = inDegree.get(dep)! - 1
      inDegree.set(dep, newInDegree)
      if (newInDegree === 0) {
        wave.push(dep)
      }
    }
  }

  if (result.length !== mods.size) {
    throw Error(
      `circular dependency: ${inDegree
        .entries()
        .filter(([, v]) => v !== 0)
        .map(([k]) => k)
        .toArray()
        .join(', ')}`,
    )
  }
  return result
}
