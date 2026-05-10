# @mcp/tests

## 0.1.2

### Patch Changes

- Improve type-safe test generation guidance and context extraction.

  - Add configurable strict typing rules in `get_test_guidelines` via `.mcp-tests.rules.json` / `.mcp-testsrc.json`.
  - Add inferred `requiredTypeImports` in `get_test_context` to suggest concrete source/dependency types for tests.
  - Improve relative import resolution for TypeScript sources importing `.js` paths.
  - Update package docs with custom typing rules and type import inference behavior.

## 0.1.1

### Patch Changes

- e0d5e32: Prepare packages for npm publishing with release metadata, Changesets workflow support, and improved package documentation.

## 0.1.1

### Patch Changes

- 3723dad: Prepare packages for npm publishing with release metadata, Changesets workflow support, and improved package documentation.
