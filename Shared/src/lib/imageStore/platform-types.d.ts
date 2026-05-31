/**
 * Type declarations for platform-specific modules that are only available
 * at runtime on their respective platforms (Tauri / Capacitor).
 * These dynamic imports will only execute on the correct platform.
 */

declare module '@tauri-apps/plugin-fs' {
  export function exists(path: string): Promise<boolean>
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  export function writeFile(path: string, data: Uint8Array): Promise<void>
  export function readFile(path: string): Promise<Uint8Array>
  export function remove(path: string): Promise<void>
}

declare module '@tauri-apps/api/path' {
  export function appDataDir(): Promise<string>
}

declare module '@capacitor/filesystem' {
  export enum Directory {
    Data = 'DATA',
    Documents = 'DOCUMENTS',
    Cache = 'CACHE',
  }

  export interface WriteFileOptions {
    path: string
    data: string
    directory: Directory
    recursive?: boolean
  }

  export interface ReadFileOptions {
    path: string
    directory: Directory
  }

  export interface ReadFileResult {
    data: string | Blob
  }

  export interface MkdirOptions {
    path: string
    directory: Directory
    recursive?: boolean
  }

  export interface DeleteFileOptions {
    path: string
    directory: Directory
  }

  export const Filesystem: {
    writeFile(options: WriteFileOptions): Promise<void>
    readFile(options: ReadFileOptions): Promise<ReadFileResult>
    mkdir(options: MkdirOptions): Promise<void>
    deleteFile(options: DeleteFileOptions): Promise<void>
  }
}
