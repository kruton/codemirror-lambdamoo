import type { Transport } from "@codemirror/lsp-client";
import type { Remote } from "comlink";
import type { LspWorkerApi } from "./worker-api.js";

export class WorkerTransport implements Transport {
  readonly failure: Promise<never>;
  private rejectFailure!: (error: unknown) => void;
  private readonly handlers = new Set<(value: string) => void>();
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private failed = false;

  constructor(
    private readonly remote: Remote<LspWorkerApi>,
    private readonly onError: (error: Error) => void,
  ) {
    this.failure = new Promise<never>((_resolve, reject) => {
      this.rejectFailure = reject;
    });
    void this.failure.catch(() => undefined);
  }

  send(message: string): void {
    if (this.closed) throw new Error("The LambdaMOO worker transport is closed");
    if (this.failed) throw new Error("The LambdaMOO worker transport has failed");

    this.tail = this.tail.then(async () => {
      const outgoing = await this.remote.handleMessage(message);
      for (const response of outgoing) {
        for (const handler of this.handlers) handler(response);
      }
    });
    void this.tail.catch((error: unknown) => this.fail(error));
  }

  subscribe(handler: (value: string) => void): void {
    this.handlers.add(handler);
  }

  unsubscribe(handler: (value: string) => void): void {
    this.handlers.delete(handler);
  }

  async idle(): Promise<void> {
    await this.tail;
  }

  close(): void {
    this.closed = true;
    this.handlers.clear();
  }

  fail(error: unknown): void {
    if (this.failed || this.closed) return;
    this.failed = true;
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.onError(normalized);
    this.rejectFailure(normalized);
  }
}
