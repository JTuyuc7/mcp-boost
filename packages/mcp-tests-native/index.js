"use strict";

const fs = require("node:fs");
const path = require("node:path");

function tryRequire(filePath) {
  try {
    return require(filePath);
  } catch {
    return null;
  }
}

function loadNativeBinding() {
  const candidates = [
    path.join(__dirname, "native", "index.node"),
    path.join(__dirname, "native", "mcp-tests-native.node"),
    path.join(__dirname, "index.node"),
    path.join(__dirname, "mcp-tests-native.node"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const binding = tryRequire(candidate);
    if (binding) return binding;
  }

  return null;
}

const binding = loadNativeBinding();

function extractStaticImports() {
  if (!binding || typeof binding.extractStaticImports !== "function") {
    throw new Error(
      "@mcp-boost/tests-native binary is not built. Run 'pnpm --filter @mcp-boost/tests-native run build:native'."
    );
  }
  return binding.extractStaticImports.apply(binding, arguments);
}

function scanTestContextSource() {
  if (!binding || typeof binding.scanTestContextSource !== "function") {
    throw new Error(
      "@mcp-boost/tests-native binary does not expose scanTestContextSource. Rebuild with 'pnpm --filter @mcp-boost/tests-native run build:native'."
    );
  }
  return binding.scanTestContextSource.apply(binding, arguments);
}

module.exports = {
  extractStaticImports,
  scanTestContextSource,
};

