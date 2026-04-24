import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const runOnceScript = path.join(repoRoot, "scripts/run-get-test-context-once.mjs");

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function hasCargo() {
  try {
    execSync("cargo --version", {
      cwd: repoRoot,
      stdio: "ignore",
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

function runOnce({ rootPath, filePath, disableNative }) {
  const result = spawnSync(
    process.execPath,
    [runOnceScript, repoRoot, rootPath, filePath],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        MCP_TESTS_DISABLE_NATIVE_CONTEXT: disableNative ? "1" : "0",
      },
    }
  );

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`run-get-test-context-once failed (disableNative=${disableNative})`);
  }

  return JSON.parse(result.stdout);
}

function normalizePayload(payload) {
  const file = payload?.files?.[0] ?? {};
  const ownExports = (file.ownExports ?? [])
    .map((d) => `${d.kind}:${d.name}:${d.snippet ?? ""}`)
    .sort();

  const depExports = Object.fromEntries(
    Object.entries(file.dependencyExports ?? {})
      .map(([dep, list]) => [
        dep,
        (list ?? []).map((d) => `${d.kind}:${d.name}:${d.snippet ?? ""}`).sort(),
      ])
      .sort(([a], [b]) => a.localeCompare(b))
  );

  return {
    firstLevelImports: [...(file.firstLevelImports ?? [])].sort(),
    ownExports,
    depExports,
  };
}

function main() {
  if (!hasCargo()) {
    console.log("\nSkipping get_test_context parity check: Rust cargo is not installed on this machine.");
    return;
  }

  run("pnpm --filter @mcp-boost/tests-native run build:native");
  run("pnpm --filter @mcp-boost/tests build");

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-tests-context-"));
  try {
    const srcDir = path.join(fixtureRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const mainFile = path.join(srcDir, "main.ts");
    const depFile = path.join(srcDir, "dep.ts");

    fs.writeFileSync(
      mainFile,
      [
        'import { DepType, depFn } from "./dep";',
        "",
        "export interface MainType {",
        "  value: string;",
        "}",
        "",
        "export function useDep(input: DepType): string {",
        "  return depFn(input);",
        "}",
      ].join("\n"),
      "utf-8"
    );

    fs.writeFileSync(
      depFile,
      [
        "export type DepType = { id: string };",
        "export function depFn(input: DepType): string {",
        "  return input.id;",
        "}",
      ].join("\n"),
      "utf-8"
    );

    const nativePayload = runOnce({ rootPath: fixtureRoot, filePath: mainFile, disableNative: false });
    const fallbackPayload = runOnce({ rootPath: fixtureRoot, filePath: mainFile, disableNative: true });

    const nativeShape = normalizePayload(nativePayload);
    const fallbackShape = normalizePayload(fallbackPayload);

    if (JSON.stringify(nativeShape) !== JSON.stringify(fallbackShape)) {
      console.error("\nNative vs fallback mismatch detected.");
      console.error("Native:", JSON.stringify(nativeShape, null, 2));
      console.error("Fallback:", JSON.stringify(fallbackShape, null, 2));
      process.exit(1);
    }

    console.log("\nget_test_context parity check passed (native == fallback).\n");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main();

