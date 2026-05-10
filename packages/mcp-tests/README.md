# @mcp-boost/tests

MCP server for test automation in JavaScript/TypeScript repositories.

## What It Provides

- Project readiness and changed-file analysis.
- Coverage execution (Jest/Vitest).
- Source/test context extraction.
- Safe test-file writes (test files only, optional TypeScript validation).
- Structured workflow orchestration via MCP tools.

## Install

```bash
npm install @mcp-boost/tests
```

Optional native acceleration is resolved via `@mcp-boost/tests-native` automatically when available.

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
pnpm --filter @mcp-boost/tests build
pnpm --filter @mcp-boost/tests dev
```

## Custom typing rules (optional)

To enforce stricter type generation in tests, add one of these files at repo root:

- `.mcp-tests.rules.json`
- `.mcp-testsrc.json`

Example:

```json
{
  "typeSafety": {
	"enforceNoAny": true,
	"requireTypeImports": true,
	"preferTypedFactories": true
  },
  "additionalRules": [
	"Import component props from the source module; never redefine prop types in tests.",
	"For API payload fixtures, use exported DTO types from src/types."
  ]
}
```

`get_test_guidelines` will include these rules in the generated guidance.

`get_test_context` also returns `requiredTypeImports` per analyzed file with inferred symbols and source module paths so test generation can import concrete types instead of falling back to `any`.

