export interface LspWorkerApi {
  initialize(): Promise<void>;
  handleMessage(json: string): Promise<readonly string[]>;
  dispose(): Promise<void>;
}
