#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { validateConnector } = require("../lib/validator");

// ── Argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json" || args[i] === "-j") flags.json = true;
  else if (args[i] === "--help" || args[i] === "-h") flags.help = true;
  else if (args[i] === "--version" || args[i] === "-v") flags.version = true;
  else positional.push(args[i]);
}

// ── Help ─────────────────────────────────────────────────────────────────
if (flags.help) {
  console.log(`
  ppcv - Power Platform Custom Connector Validator

  Usage:
    ppcv [path] [options]

  Arguments:
    path          Path to connector folder or apiDefinition.swagger.json
                  (defaults to current directory)

  Options:
    --json, -j    Output results as JSON (for CI/CD pipelines)
    --help, -h    Show this help message
    --version, -v Show version number

  Examples:
    ppcv MyConnector
    ppcv MyConnector/apiDefinition.swagger.json
    ppcv --json
    ppcv MyConnector -j | jq '.errors'
  `);
  process.exit(0);
}

// ── Version ──────────────────────────────────────────────────────────────
if (flags.version) {
  const pkg = require("../package.json");
  console.log(pkg.version);
  process.exit(0);
}

// ── Resolve connector directory ──────────────────────────────────────────
let targetPath = positional[0] || ".";
targetPath = path.resolve(targetPath);

let connectorDir;
if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
  connectorDir = targetPath;
} else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
  connectorDir = path.dirname(targetPath);
} else {
  console.error(`Error: path not found: ${targetPath}`);
  process.exit(1);
}

// ── Validate ─────────────────────────────────────────────────────────────
const result = validateConnector(connectorDir);

// ── JSON output ──────────────────────────────────────────────────────────
if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

// ── Text output ──────────────────────────────────────────────────────────
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

console.log("");
console.log(`${CYAN}Connector Validator${RESET}`);
console.log(`${DIM}────────────────────────────────────────────────${RESET}`);
console.log(`Connector: ${result.connector}`);
console.log("");

let fileNum = 0;
const fileCount = Object.keys(result.files).length;

for (const [fileName, fileResult] of Object.entries(result.files)) {
  fileNum++;
  console.log(`[${fileNum}/${fileCount}] ${fileName}`);

  if (fileResult.errors.length > 0) {
    console.log(`${RED}  ERRORS (${fileResult.errors.length}):${RESET}`);
    for (const err of fileResult.errors) {
      console.log(`${RED}    ✗ ${err}${RESET}`);
    }
  }
  if (fileResult.warnings.length > 0) {
    console.log(`${YELLOW}  WARNINGS (${fileResult.warnings.length}):${RESET}`);
    for (const warn of fileResult.warnings) {
      console.log(`${YELLOW}    ⚠ ${warn}${RESET}`);
    }
  }
  if (fileResult.errors.length === 0 && fileResult.warnings.length === 0) {
    console.log(`${GREEN}  No issues${RESET}`);
  }

  if (fileName === "apiDefinition.swagger.json") {
    console.log(`${DIM}  Operations: ${result.operations}${RESET}`);
  }
  console.log("");
}

console.log(`${DIM}────────────────────────────────────────────────${RESET}`);
if (result.valid) {
  let summary = "PASSED ✓";
  if (result.warnings.length > 0) summary += ` (${result.warnings.length} warnings)`;
  console.log(`${GREEN}Result: ${summary}${RESET}`);
} else {
  console.log(`${RED}Result: FAILED ✗ (${result.errors.length} errors, ${result.warnings.length} warnings)${RESET}`);
}

process.exit(result.valid ? 0 : 1);
