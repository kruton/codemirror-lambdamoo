import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.cwd(), ".lsp/browser");
const destination = resolve(process.cwd(), "dist/lsp");

await mkdir(destination, { recursive: true });

// wasm-pack emits a `*` .gitignore beside its package. Copying that file into
// dist causes npm-packlist to silently omit the runtime, including the WASM.
for (const file of [
  "moo_lsp_rs.js",
  "moo_lsp_rs.d.ts",
  "moo_lsp_rs_bg.wasm",
  "moo_lsp_rs_bg.wasm.d.ts",
]) {
  await cp(resolve(source, file), resolve(destination, file));
}
