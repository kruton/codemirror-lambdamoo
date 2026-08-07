import { expose } from "comlink";
import type { LspWorkerApi, WorkerWasmSource } from "./worker-api.js";

type BrowserServer = {
  handle_message(message: string): string;
  free(): void;
};

type BrowserModule = {
  default(input?: WorkerWasmSource): Promise<unknown>;
  BrowserServer: new () => BrowserServer;
};

let server: BrowserServer | undefined;

const api: LspWorkerApi = {
  async initialize(wasm) {
    if (server) throw new Error("The LambdaMOO language server is already initialized");

    const moduleUrl = new URL("./lsp/moo_lsp_rs.js", import.meta.url).href;
    const browserModule = (await import(/* @vite-ignore */ moduleUrl)) as BrowserModule;
    await browserModule.default(wasm);
    server = new browserModule.BrowserServer();
  },

  async handleMessage(json) {
    if (!server) throw new Error("The LambdaMOO language server is not initialized");
    const outgoing: unknown = JSON.parse(server.handle_message(json));
    if (!Array.isArray(outgoing)) {
      throw new Error("The LambdaMOO language server returned a non-array response");
    }
    return outgoing.map((message) => JSON.stringify(message));
  },

  async dispose() {
    server?.free();
    server = undefined;
  },
};

expose(api);
