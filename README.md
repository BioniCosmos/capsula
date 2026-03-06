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
5. **WASM Backend** — Browser-compatible compilation
6. **Self-hosting** — Rewrite compiler in Capsula
7. **LLVM Backend** — Native performance

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
