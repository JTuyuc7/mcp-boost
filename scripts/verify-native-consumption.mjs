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

async function main() {
  // Ensure the native addon exists and TS artifacts are up to date.
  run("pnpm --filter @mcp/tests-native run build:native");
  run("pnpm --filter @mcp/tests build");

  const helperPath = path.join(repoRoot, "packages/mcp-tests/dist/helpers/native-imports.js");
  const helperModule = await import(pathToFileURL(helperPath).href);
  const { extractStaticImports } = helperModule;

  const probe = extractStaticImports('import a from "x";', new RegExp("a^"));
  console.log("\nProbe output:", JSON.stringify(probe));

  if (!Array.isArray(probe) || probe.length === 0) {
    console.error("\nNative consumption check failed: fallback parser appears to be active.");
    process.exit(1);
  }

  console.log("\nNative consumption check passed: @mcp/tests is using @mcp/tests-native.");
}

main().catch((error) => {
  console.error("\nverify-native-consumption failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

