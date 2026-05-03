# mcp-boost

Monorepo for MCP tooling focused on automated test planning, coverage workflows, and safe test generation.

## Packages

- `@mcp-boost/tests`: MCP server with tools for planning test work, reading source/test context, running coverage, and writing test files.
- `@mcp-boost/tests-native`: optional Rust acceleration used by `@mcp-boost/tests` for selected parsing paths.

## Requirements

- Node.js 18+
- pnpm 10+
- Rust toolchain is optional (only needed to build native addon locally)

## Install

```bash
pnpm install
```

## Development

```bash
pnpm build
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
