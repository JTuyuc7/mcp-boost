# mcp-boost

Monorepo for MCP tooling focused on automated test planning, coverage workflows, and safe test generation.

## What This MCP Server Does

`mcp-boost` provides an MCP server named `mcp-tests` that helps an AI coding agent work on tests in JavaScript and TypeScript projects.

It is designed to:

- inspect a repository before writing tests;
- detect changed source files;
- find existing test files or suggest where new ones should go;
- run scoped Jest/Vitest coverage;
- read only the source/test context needed for test generation;
- safely write test files without touching source files;
- optionally use a Rust native addon for faster parsing paths.

## Non-goals

`mcp-tests` is intentionally focused on safe test workflows. It does not:

- auto-merge pull requests or make release decisions;
- rewrite source files while generating tests;
- replace human review of test quality and behavior;
- guarantee 100% coverage without project-specific assertions and mocks.

## Packages

- `@mcp-boost/tests`: MCP server with tools for planning test work, reading source/test context, running coverage, and writing test files.
- `@mcp-boost/tests-native`: optional Rust acceleration used by `@mcp-boost/tests` for selected parsing paths.

## Requirements

- Node.js 18+
- pnpm 10+
- Rust toolchain is optional (only needed to build native addon locally)

## Install

From this repository:

```bash
pnpm install
pnpm build
```

Published package usage:

```bash
npm install -g @mcp-boost/tests
```

Or run it directly with `npx` from an MCP client:

```bash
npx -y @mcp-boost/tests
```

## Quickstart (60 seconds)

1. Install dependencies and build this monorepo.
2. Register the MCP server in your client config as `mcp-tests`.
3. Call `plan` with `rootPath` and review the proposed test actions before writing files.

```bash
pnpm install
pnpm build
```

Naming at a glance:

- npm package: `@mcp-boost/tests`
- MCP server key in client config: `mcp-tests`
- first tool to call: `plan`

## MCP Client Configuration

The server communicates over stdio. Most MCP clients accept a JSON config with a command and args.

### Using the Published Package

Use this when the package is available from npm:

```json
{
  "mcpServers": {
    "mcp-tests": {
      "command": "npx",
      "args": ["-y", "@mcp-boost/tests"]
    }
  }
}
```

### Using a Local Checkout

Use this while developing this repository. Build the server first with `pnpm build`, then point your MCP client to the compiled server:

```json
{
  "mcpServers": {
    "mcp-tests": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-boost/packages/mcp-tests/dist/server.js"
      ]
    }
  }
}
```

Replace `/absolute/path/to/mcp-boost` with the real path to this repository.

## Recommended Workflow

When using the MCP server from an AI coding agent, the safest workflow is:

1. Call `plan` with the repository root.
2. Review the returned plan before allowing writes.
3. Run `get_test_guidelines` to fetch project-specific test rules.
4. Run `run_coverage` for the target source files.
5. Run `read_source_files` to read source files, existing tests, suggested test paths, and import analysis.
6. Run `get_test_context` for files with complex type or relative import dependencies.
7. Use `write_test_file` to create or update only test files.
8. Run `run_coverage` again to confirm the result.

Every tool expects `rootPath` to be the absolute path of the repository being tested. The server intentionally does not infer it silently from `cwd`, because writing tests against the wrong folder would be risky.

Example tool arguments:

```json
{
  "rootPath": "/Users/you/projects/my-app",
  "base": "main"
}
```

For an explicit file list:

```json
{
  "rootPath": "/Users/you/projects/my-app",
  "files": [
    "src/lib/format.ts",
    "src/services/user-service.ts"
  ]
}
```

Example output from `plan` (truncated):

```json
{
  "ok": true,
  "project": {
    "ready": true,
    "testRunner": "jest"
  },
  "sourceFiles": ["src/lib/format.ts"],
  "proposedTestWrites": [
    {
      "source": "src/lib/format.ts",
      "test": "src/lib/format.test.ts",
      "reason": "missing_test"
    }
  ]
}
```

Example output from `run_coverage` (truncated):

```json
{
  "ok": true,
  "metrics": [
    {
      "file": "src/lib/format.ts",
      "statements": 72.5,
      "branches": 50,
      "functions": 80,
      "lines": 74
    }
  ],
  "summary": {
    "statements": 72.5,
    "branches": 50,
    "functions": 80,
    "lines": 74
  }
}
```

## Available Tools

| Tool | Purpose |
| --- | --- |
| `plan` | Read-only planning entrypoint. Detects project setup, changed files, existing tests, and proposed write targets. |
| `project_info` | Checks whether the target repo has git, `package.json`, Jest/Vitest, configs, and coverage thresholds. |
| `get_changed_files` | Lists changed source files from git diff, staged/unstaged changes, or untracked files. |
| `get_test_guidelines` | Returns testing guidance based on the detected framework and runner. |
| `run_coverage` | Runs scoped Jest/Vitest coverage for selected source files and returns structured metrics. |
| `read_source_files` | Reads source files and matching tests, suggests missing test paths, and builds import suggestions. |
| `get_test_context` | Extracts exported declarations from first-level relative dependencies for better mocks/imports. |
| `list_test_files` | Inventories test files, source files, orphan tests, and untested sources. |
| `write_test_file` | Safely creates or updates test files only. It rejects non-test paths and can validate TypeScript. |
| `help` | Returns server guidance and available workflow information. |

## Safety Rules

- `write_test_file` only accepts `.test.*` or `.spec.*` paths.
- Source files are rejected by the write tool.
- Parent directories for test files are created automatically.
- Existing test files require `overwrite: true`.
- TypeScript validation runs before writing when enabled and a `tsconfig` is present.
- Tools return structured JSON so an agent can reason about the next step without guessing.

## Native Acceleration

`@mcp-boost/tests-native` is optional. The TypeScript server works without it and falls back to JavaScript parsing.

To build and verify the native addon locally:

```bash
pnpm --filter @mcp-boost/tests-native run build:native
pnpm verify:native-consumption
pnpm verify:get-test-context-parity
```

If the native addon is unavailable, the server continues to work with the fallback path.

## Development

```bash
pnpm build
pnpm test
pnpm verify:native-consumption
pnpm verify:get-test-context-parity
```

## Semantic Versioning and Releases

This repo uses [Changesets](https://github.com/changesets/changesets) for SemVer releases.

Create a release note entry:

```bash
pnpm changeset
```

Apply version bumps locally:

```bash
pnpm version-packages
```

Publish packages to npm:

```bash
pnpm release
```

## GitHub Release Automation

The `release.yml` workflow:

1. Opens/updates a version PR from pending changesets.
2. Publishes changed packages to npm after the version PR is merged into `master`.

Required repo secret:

- `NPM_TOKEN`: npm automation token with publish permissions for the package scope.

## NPM Setup Checklist

1. Ensure package names/scope exist and you have publish rights.
2. Enable 2FA on npm account (recommended).
3. Create an npm automation token.
4. Add token as GitHub secret `NPM_TOKEN`.
5. Merge PRs with changesets into `master`.

------
Developed by Jaime T (JTuyuc7)
