// Mock for @tauri-apps/api/path in test environment
export async function appDataDir() { return '/mock/app-data' }
export async function join(...parts: string[]) { return parts.join('/') }
