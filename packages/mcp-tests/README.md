# @mcp/tests

MCP server for test automation in JavaScript/TypeScript repositories.

## What It Provides

- Project readiness and changed-file analysis.
- Coverage execution (Jest/Vitest).
- Source/test context extraction.
- Safe test-file writes (test files only, optional TypeScript validation).
- Structured workflow orchestration via MCP tools.

## Install

```bash
npm install @mcp/tests
```

Optional native acceleration is resolved via `@mcp/tests-native` automatically when available.

## Run

CLI entrypoint:

```bash
npx mcp-tests
```

Direct Node execution:

```bash
node ./dist/server.js
```

## Development

```bash
pnpm --filter @mcp/tests build
pnpm --filter @mcp/tests dev
```
