# codemirror-lambdamoo

This package implements LambdaMOO language support (aka `.moo` or MOO code)
for the [CodeMirror](https://codemirror.net) code editor.

## Install

```sh
npm install codemirror-lambdamoo
```

## Usage

```ts
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { createLambdaMOO } from "codemirror-lambdamoo";

const moo = await createLambdaMOO();

const view = new EditorView({
  doc: "notify(player, \"Hello!\");",
  extensions: [
    basicSetup,
    moo.extension("file:///verbs/hello.moo"),
  ],
  parent: document.body,
});

// Destroy editor views before shutting down their shared language server.
view.destroy();
await moo.destroy();
```

One support object owns one worker and one LSP session. Reuse it for multiple
editors by calling `extension()` with a distinct document URI for each editor.

## Loading WebAssembly

The bundled server is loaded by default. Applications that copy or host WASM
separately can override it with a URL, response, bytes, compiled module, or
async loader:

```ts
const moo = await createLambdaMOO({
  wasm: new URL("/assets/moo_lsp_rs_bg.wasm", location.href),
  onError(error) {
    console.error("LambdaMOO language server failed", error);
  },
});
```

Accepted values are `string`, `URL`, `Response`, `ArrayBuffer`, `Uint8Array`,
and `WebAssembly.Module`. Byte inputs are copied before being transferred, so
the caller's buffer is not detached. Override binaries must be compatible with
the packaged wasm-bindgen glue. Cross-origin URLs must allow CORS.

For a custom worker construction policy:

```ts
const moo = await createLambdaMOO({
  workerFactory: (url) => new Worker(url, {
    type: "module",
    name: "LambdaMOO LSP",
  }),
});
```

A restrictive Content Security Policy must permit module workers and WebAssembly
compilation, typically through suitable `worker-src` and `script-src
'wasm-unsafe-eval'` directives.

## API

### `createLambdaMOO(options?)`

Returns a promise for `LambdaMOOSupport`. The promise resolves only after the
worker, WebAssembly module, and LSP initialization exchange are ready.

Options:

- `wasm`: custom WASM source or loader.
- `rootUri`: project root URI sent during LSP initialization.
- `timeout`: LSP and shutdown timeout in milliseconds; defaults to 3000.
- `workerFactory`: constructs the module worker from the packaged worker URL.
- `onError`: receives worker, transport, and semantic-token errors.

The returned object provides:

- `extension(uri)`: LambdaMOO mode and LSP support for one document.
- `client`: the underlying `@codemirror/lsp-client` client.
- `destroy()`: graceful LSP shutdown followed by worker termination.

### `lambdaMOO()`

Returns standalone CodeMirror `LanguageSupport` with highlighting, comments,
bracket metadata, and indentation.

## Development

Typical development flow:

```sh
npm install
npm run sync:lsp
npm run check
npx playwright install chromium firefox
npm run test:browser
```

`sync:lsp` downloads `moo-lsp-rs-browser.tar.gz` and `SHA256SUMS` for the pinned
`moo-lsp-rs` release. In CI it also verifies the GitHub build-provenance
attestation. The staged files live under `.lsp/`; only built assets under `dist/`
are published.

## See also

- [moo-lsp-rs](https://github.com/kruton/moo-lsp-rs/)
- [tree-sitter-lambdamoo](https://github.com/kruton/tree-sitter-lambdamoo/)

## License

MIT
