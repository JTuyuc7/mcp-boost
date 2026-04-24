import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

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

async function main() {
  if (!hasCargo()) {
    console.log("\nSkipping native consumption check: Rust cargo is not installed on this machine.");
    return;
  }

  // Ensure the native addon exists and TS artifacts are up to date.
  run("pnpm --filter @mcp-boost/tests-native run build:native");
  run("pnpm --filter @mcp-boost/tests build");

  const helperPath = path.join(repoRoot, "packages/mcp-tests/dist/helpers/native-imports.js");
  const helperModule = await import(pathToFileURL(helperPath).href);
  const { extractStaticImports } = helperModule;

  const contextHelperPath = path.join(repoRoot, "packages/mcp-tests/dist/helpers/native-test-context.js");
  const contextHelperModule = await import(pathToFileURL(contextHelperPath).href);
  const { scanTestContextSource } = contextHelperModule;

  const probe = extractStaticImports('import a from "x";', new RegExp("a^"));
  console.log("\nProbe output:", JSON.stringify(probe));

  if (!Array.isArray(probe) || probe.length === 0) {
    console.error("\nNative consumption check failed: fallback parser appears to be active.");
    process.exit(1);
  }

  const contextProbe = scanTestContextSource([
    'export interface Foo { value: string }',
    'import { bar } from "./bar";'
  ].join("\n"));

  if (!contextProbe || contextProbe.relativeImports.length === 0 || contextProbe.ownExports.length === 0) {
    console.error("\nNative test-context check failed: fallback parser appears to be active.");
    process.exit(1);
  }

  console.log("\nNative consumption check passed: @mcp-boost/tests is using @mcp-boost/tests-native (imports + test-context scan).");
}

main().catch((error) => {
  console.error("\nverify-native-consumption failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

