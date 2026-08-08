import { execFileSync } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.cwd(), ".lsp/browser");
const destination = resolve(process.cwd(), "dist/lsp");

const files = ["moo_lsp_rs.js", "moo_lsp_rs.d.ts", "moo_lsp_rs_bg.wasm", "moo_lsp_rs_bg.wasm.d.ts"];

const exists = await Promise.all(
  files.map((file) =>
    stat(resolve(source, file))
      .then(() => true)
      .catch(() => false),
  ),
);

if (exists.some((fileExist) => !fileExist)) {
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/sync-lsp.ts"], {
    stdio: "inherit",
  });
}

await mkdir(destination, { recursive: true });

// wasm-pack emits a `*` .gitignore beside its package. Copying that file into
// dist causes npm-packlist to silently omit the runtime, including the WASM.
for (const file of files) {
  await cp(resolve(source, file), resolve(destination, file));
}
