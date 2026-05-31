import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      '@tauri-apps/plugin-fs': '/src/test/__mocks__/tauri-fs.ts',
      '@tauri-apps/api/path': '/src/test/__mocks__/tauri-path.ts',
      '@capacitor/filesystem': '/src/test/__mocks__/capacitor-filesystem.ts',
    },
  },
})