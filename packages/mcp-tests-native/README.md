# @mcp-boost/tests-native

Optional Rust acceleration for `@mcp-boost/tests`.

This package is **non-blocking**:
- If the native binary is present, `@mcp-boost/tests` uses it for static import extraction.
- If it is missing, `@mcp-boost/tests` falls back to the existing TypeScript parser.

## Install

Normally you do not install this package directly.
Install `@mcp-boost/tests` and it will use this package as an optional dependency when available.

## Build native binary

Prerequisites:
- Rust toolchain (`rustup`)
- Node.js and pnpm

```bash
pnpm --filter @mcp-boost/tests-native run build:native
```

The command outputs `native/index.node`.

## Verify `@mcp-boost/tests` consumes native path

One command from repo root:

```bash
pnpm verify:native-consumption
```

Equivalent manual steps:

```bash
pnpm --filter @mcp-boost/tests-native run build:native
pnpm --filter @mcp-boost/tests build
node --input-type=module -e "import { extractStaticImports } from './packages/mcp-tests/dist/helpers/native-imports.js'; console.log(extractStaticImports('import a from \\\"x\\\";', new RegExp('a^')));"
```

If the output contains an import match, native is being used.
If native is not available, the fallback path uses the regex argument and this exact probe returns `[]`.

## Why this first step

This is a safe migration baseline:
- Keeps existing behavior unchanged by default.
- Introduces a Rust extension point for hot paths.
- Allows iterative porting function-by-function.

