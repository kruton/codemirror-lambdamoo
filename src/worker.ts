import { createLanguageServer, type JsonRpcMessage, type LanguageServer } from "@kruton/moo-lsp";
import { expose } from "comlink";
import type { LspWorkerApi } from "./worker-api.js";

let server: LanguageServer | undefined;

const api: LspWorkerApi = {
  async initialize() {
    if (server) throw new Error("The LambdaMOO language server is already initialized");
    server = await createLanguageServer();
  },

  async handleMessage(json) {
    if (!server) throw new Error("The LambdaMOO language server is not initialized");
    const incoming = JSON.parse(json) as JsonRpcMessage;
    const outgoing = server.handleMessage(incoming);
    return outgoing.map((message) => JSON.stringify(message));
  },

  async dispose() {
    server?.dispose();
    server = undefined;
  },
};

expose(api);
