import { LSPClient, type LSPClientConfig, languageServerExtensions } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import { releaseProxy, wrap } from "comlink";
import { documentHighlightCapabilities, documentHighlights } from "./document-highlights.js";
import { lambdaMOO } from "./language.js";
import { semanticTokenCapabilities, semanticTokens } from "./semantic-tokens.js";
import { WorkerTransport } from "./transport.js";
import type { LspWorkerApi } from "./worker-api.js";

export { lambdaMOO, lambdaMOOLanguage } from "./language.js";
export type { LspWorkerApi } from "./worker-api.js";

export type LambdaMOOOptions = {
  rootUri?: string;
  timeout?: number;
  workerFactory?: (url: URL) => Worker;
  onError?: (error: Error) => void;
};

export interface LambdaMOOSupport {
  readonly client: LSPClient;
  extension(uri: string): Extension;
  destroy(): Promise<void>;
}

export async function createLambdaMOO(options: LambdaMOOOptions = {}): Promise<LambdaMOOSupport> {
  const reportError = deduplicateErrors(options.onError ?? defaultErrorHandler);
  const timeout = options.timeout ?? 3000;
  const workerUrl = new URL("./worker.js", import.meta.url);
  const worker = options.workerFactory
    ? options.workerFactory(workerUrl)
    : new Worker(workerUrl, { name: "LambdaMOO language server", type: "module" });
  const remote = wrap<LspWorkerApi>(worker);
  const workerFailure = listenForWorkerFailure(worker, reportError);

  try {
    await withTimeout(
      Promise.race([remote.initialize(), workerFailure.promise]),
      timeout,
      "worker initialization",
    );
  } catch (error) {
    workerFailure.dispose();
    remote[releaseProxy]();
    worker.terminate();
    const normalized = normalizeError(error);
    reportError(normalized);
    throw normalized;
  }

  const transport = new WorkerTransport(remote, reportError);
  void workerFailure.promise.catch((error: Error) => transport.fail(error));
  const clientConfig: LSPClientConfig = {
    rootUri: options.rootUri,
    timeout: options.timeout,
    extensions: [
      ...languageServerExtensions(),
      documentHighlightCapabilities,
      semanticTokenCapabilities,
    ],
  };
  const client = new LSPClient(clientConfig).connect(transport);

  try {
    await Promise.race([client.initializing, transport.failure, workerFailure.promise]);
  } catch (error) {
    transport.close();
    workerFailure.dispose();
    remote[releaseProxy]();
    worker.terminate();
    const normalized = normalizeError(error);
    reportError(normalized);
    throw normalized;
  }

  let destroyed = false;
  return {
    client,
    extension(uri) {
      if (destroyed) throw new Error("This LambdaMOO support object has been destroyed");
      return [
        lambdaMOO(),
        client.plugin(uri, "lambdamoo"),
        documentHighlights(client, uri, reportError),
        semanticTokens(client, uri, reportError),
      ];
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        await withTimeout(client.request("shutdown", null), timeout, "LSP shutdown");
        client.notification("exit", {});
        await transport.idle();
        await withTimeout(remote.dispose(), timeout, "worker disposal");
      } catch (error) {
        reportError(normalizeError(error));
      } finally {
        transport.close();
        client.disconnect();
        workerFailure.dispose();
        remote[releaseProxy]();
        worker.terminate();
      }
    },
  };
}

function listenForWorkerFailure(worker: Worker, onError: (error: Error) => void) {
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  void promise.catch(() => undefined);

  const error = (event: ErrorEvent) => {
    const failure = event.error instanceof Error ? event.error : new Error(event.message);
    onError(failure);
    reject(failure);
  };
  const messageError = () => {
    const failure = new Error("The LambdaMOO worker could not deserialize a message");
    onError(failure);
    reject(failure);
  };
  worker.addEventListener("error", error);
  worker.addEventListener("messageerror", messageError);
  return {
    promise,
    dispose() {
      worker.removeEventListener("error", error);
      worker.removeEventListener("messageerror", messageError);
    },
  };
}

function deduplicateErrors(handler: (error: Error) => void): (error: Error) => void {
  const seen = new WeakSet<Error>();
  return (error) => {
    if (seen.has(error)) return;
    seen.add(error);
    handler(error);
  };
}

function defaultErrorHandler(error: Error): void {
  console.error("[codemirror-lambdamoo]", error);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function withTimeout<T>(promise: Promise<T>, timeout: number, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`LambdaMOO ${operation} timed out`)), timeout);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
