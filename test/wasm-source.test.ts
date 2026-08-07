import { describe, expect, it } from "vitest";
import { normalizeWasmSource } from "../src/wasm-source.js";

describe("WASM source normalization", () => {
  it("normalizes URLs and async loaders", async () => {
    await expect(normalizeWasmSource(new URL("https://example.test/moo.wasm"))).resolves.toBe(
      "https://example.test/moo.wasm",
    );
    await expect(normalizeWasmSource(async () => "/moo.wasm")).resolves.toBe("/moo.wasm");
  });

  it("copies caller-owned bytes", async () => {
    const source = new Uint8Array([1, 2, 3]);
    const normalized = (await normalizeWasmSource(source)) as ArrayBuffer;
    source[0] = 9;
    expect([...new Uint8Array(normalized)]).toEqual([1, 2, 3]);
  });

  it("rejects unsuccessful responses", async () => {
    const response = new Response(null, { status: 404 });
    await expect(normalizeWasmSource(response)).rejects.toThrow("HTTP 404");
  });
});
