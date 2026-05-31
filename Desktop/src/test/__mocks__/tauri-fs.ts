// Mock for @tauri-apps/plugin-fs in test environment
export async function exists() { return false }
export async function mkdir() {}
export async function readFile() { return new Uint8Array() }
export async function writeFile() {}
export async function remove() {}
export async function readDir() { return [] }
export const BaseDirectory = { AppData: 0 }
