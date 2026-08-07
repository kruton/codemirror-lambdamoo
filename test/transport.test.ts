import type { Remote } from "comlink";
import { describe, expect, it, vi } from "vitest";
import { WorkerTransport } from "../src/transport.js";
import type { LspWorkerApi } from "../src/worker-api.js";

describe("WorkerTransport", () => {
  it("serializes calls and delivers each returned message in order", async () => {
    const calls: string[] = [];
    const remote = {
      async handleMessage(message: string) {
        calls.push(message);
        await Promise.resolve();
        return [`${message}-one`, `${message}-two`];
      },
    } as unknown as Remote<LspWorkerApi>;
    const transport = new WorkerTransport(remote, vi.fn());
    const received: string[] = [];
    transport.subscribe((message) => received.push(message));

    transport.send("first");
    transport.send("second");
    await transport.idle();

    expect(calls).toEqual(["first", "second"]);
    expect(received).toEqual(["first-one", "first-two", "second-one", "second-two"]);
  });

  it("reports remote failures once", async () => {
    const failure = new Error("worker failed");
    const remote = {
      handleMessage: vi.fn().mockRejectedValue(failure),
    } as unknown as Remote<LspWorkerApi>;
    const onError = vi.fn();
    const transport = new WorkerTransport(remote, onError);

    transport.send("request");
    await expect(transport.idle()).rejects.toBe(failure);
    await expect(transport.failure).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledOnce();
  });
});
