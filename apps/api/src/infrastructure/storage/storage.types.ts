export const STORAGE_PORT = Symbol("STORAGE_PORT");

export interface StoragePort {
  put(objectKey: string, data: Buffer, contentType: string): Promise<void>;
}
