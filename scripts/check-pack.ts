import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

type PackageTree = {
  path: string;
  package: Record<string, unknown>;
  isProjectRoot: true;
  edgesOut: Map<string, never>;
};

const require = createRequire(import.meta.url);
const packlist = require("npm-packlist") as (tree: PackageTree) => Promise<string[]>;
const packageDirectory = process.cwd();
const packageManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const files = await packlist({
  path: packageDirectory,
  package: packageManifest,
  isProjectRoot: true,
  edgesOut: new Map<string, never>(),
});
const included = new Set(files);
const required = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/worker.js",
  "dist/lsp/moo_lsp_rs.js",
  "dist/lsp/moo_lsp_rs_bg.wasm",
  "README.md",
  "LICENSE",
];
const missing = required.filter((path) => !included.has(path));
if (missing.length > 0) throw new Error(`Packed package is missing: ${missing.join(", ")}`);

process.stdout.write(`Package contains ${files.length} files, including all runtime assets.\n`);
