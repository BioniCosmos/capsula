# Capsula

A programming language exploring the duality of emptiness and encapsulation.

---

## Overview

Capsula is an experimental programming language designed to support two distinct syntaxes—Lisp-style S-expressions and a custom C-family inspired syntax—while offering both interpreted and compiled execution modes.

The name combines *void* (the emptiness from which computation emerges) and *capsule* (the encapsulation of logic and data).

---

## Key Features

### Dual Syntax Support

Write code in the style that fits your context:

```lisp
;; S-expression syntax (Lisp-style)
(defn factorial [n]
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))
```

```rust
// Custom syntax (C-family inspired)
fn factorial(n: int) -> int {
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}
```

Both parse to the same AST and execute identically.

### Dual Execution Modes

**Tree-walking Interpreter** (`capsula run`)

- Fast startup, ideal for scripting and REPL
- Immediate feedback during development

**Bytecode Compiler** (`capsula build`)

- Compiles to custom bytecode running on a VM
- 10x+ performance improvement for production

**Future Targets**: WASM, LLVM IR

### Evaluation Strategy

**Default eager evaluation** with **explicit lazy evaluation**:

```lisp
(let x (+ 1 2))           ; Eager: immediately evaluates to 3
(let y @(expensive-op))   ; Lazy: creates a thunk
(force y)                 ; Forces evaluation when needed
```

Special forms (`if`, `and`, `or`, `cond`) use lazy evaluation naturally for short-circuiting.

---

## Project Status

**Current Phase**: Early implementation (Tree-walking interpreter)

- [x] S-expression parser
- [x] Basic AST evaluation
- [x] Environment/scoping system
- [x] Native functions (+, -, \*, /, =)
- [ ] Special forms refactor (in progress)
- [ ] Bytecode VM
- [ ] Custom syntax parser
- [ ] Type system (Go-like simplicity first)
- [ ] WASM backend
- [ ] Self-hosting

---

## Quick Start

```bash
# Clone and setup
git clone https://github.com/username/capsula.git
cd capsula
bun install

# Run a file (interpreter mode)
bun run index.ts example.cap

# REPL
bun run index.ts
> (+ 1 2)
3
```

---

## Roadmap

1. **Core Semantics** — Stabilize AST, evaluation rules, and special forms
2. **Bytecode VM** — Implement stack-based VM and compiler
3. **Custom Syntax** — Pratt parser for C-family syntax
4. **Type System** — Gradual typing (dynamic → static → inference)
5. **Self-hosting** — Rewrite compiler in Capsula (see below)
6. **LLVM Backend** — Native performance

---

## Self-hosting Plan

Self-hosting means the Capsula compiler is written in Capsula itself. The path has three stages:

### Stage 1 — Metacircular Interpreter

Write a Capsula parser and tree-walking evaluator in Capsula, run it on the existing TypeScript interpreter:

```
TypeScript interpreter
  └─▶ eval.cv  (Capsula evaluator written in Capsula)
        └─▶ program.cv  (any Capsula program)
```

This proves the language is expressive enough to describe its own semantics, and that both interpreters agree on behavior. Performance is not a goal here.

Minimum language features required before starting:

- `quote`, `let`, `begin`
- Arithmetic and comparison operators (`-`, `*`, `/`, `=`, `<`, `>`)
- String operations (`string-ref`, `string-length`, `substring`)
- Tail call optimization (TCO)

### Stage 2 — LLVM IR Code Generator

Extend the Capsula compiler to emit LLVM IR instead of interpreting. Run it on the Stage 1 interpreter:

```
TypeScript interpreter
  └─▶ compiler.cv  (Capsula → LLVM IR, written in Capsula)
        └─▶ compiler.cv  (compiles itself, outputs compiler.ll)

llc compiler.ll -o compiler  (native binary)
```

LLVM IR is chosen over raw assembly because it handles register allocation, optimization, and multi-platform output (x86-64, ARM, RISC-V) automatically.

### Stage 3 — True Self-hosting

The native binary produced in Stage 2 compiles Capsula source without any TypeScript dependency:

```
compiler  (native binary)
  └─▶ compiler.cv  (compiles itself again, closes the bootstrap loop)
```

At this point the TypeScript implementation can be retired.

---

## Philosophy

- **Explicit over implicit**: Lazy evaluation must be explicit (`@` or `delay`)
- **Unified core**: One AST, multiple frontends, multiple backends
- **Pragmatic types**: Start simple (Go-like), grow powerful (Rust-like)
- **Systems-capable**: Eventually compete with Zig/Rust for systems programming

---

## License

MIT

---

> *"In the void, we encapsulate possibility."*
