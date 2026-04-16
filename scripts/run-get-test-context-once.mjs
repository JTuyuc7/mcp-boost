import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , repoRoot, rootPath, filePath] = process.argv;

if (!repoRoot || !rootPath || !filePath) {
  console.error("Usage: node scripts/run-get-test-context-once.mjs <repoRoot> <rootPath> <filePath>");
  process.exit(1);
}

const modulePath = path.join(repoRoot, "packages/mcp-tests/dist/tools/get-test-context.js");
const { registerGetTestContext } = await import(pathToFileURL(modulePath).href);

let handler = null;
const fakeServer = {
  registerTool(name, _meta, fn) {
    if (name === "get_test_context") {
      handler = fn;
    }
  },
};

registerGetTestContext(fakeServer);

if (!handler) {
  console.error("Could not capture get_test_context handler from registerGetTestContext.");
  process.exit(1);
}

const response = await handler({
  rootPath,
  files: [filePath],
  maxDepth: 2,
});

const raw = response?.content?.[0]?.text;
if (typeof raw !== "string") {
  console.error("get_test_context returned an unexpected payload shape.");
  process.exit(1);
}

process.stdout.write(raw);

