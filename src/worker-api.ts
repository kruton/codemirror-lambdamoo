export type WorkerWasmSource = string | ArrayBuffer | WebAssembly.Module;

export interface LspWorkerApi {
  initialize(wasm: WorkerWasmSource): Promise<void>;
  handleMessage(json: string): Promise<readonly string[]>;
  dispose(): Promise<void>;
}
