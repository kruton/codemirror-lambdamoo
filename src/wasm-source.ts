import type { WorkerWasmSource } from "./worker-api.js";

export type WasmSource = string | URL | Response | ArrayBuffer | Uint8Array | WebAssembly.Module;

export async function normalizeWasmSource(
  source: WasmSource | (() => WasmSource | Promise<WasmSource>) | undefined,
): Promise<WorkerWasmSource> {
  const resolved = typeof source === "function" ? await source() : source;
  if (!resolved) throw new Error("No LambdaMOO WebAssembly source was provided");
  if (typeof resolved === "string") return resolved;
  if (resolved instanceof URL) return resolved.href;
  if (resolved instanceof WebAssembly.Module) return resolved;
  if (resolved instanceof Response) {
    if (!resolved.ok) {
      throw new Error(`Could not load LambdaMOO WebAssembly: HTTP ${resolved.status}`);
    }
    return resolved.arrayBuffer();
  }
  if (resolved instanceof ArrayBuffer) return resolved.slice(0);
  if (resolved instanceof Uint8Array) return new Uint8Array(resolved).buffer;
  throw new TypeError("Unsupported LambdaMOO WebAssembly source");
}
