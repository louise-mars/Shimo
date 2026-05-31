// Mock for @capacitor/filesystem in test environment
export const Filesystem = {
  writeFile: async () => ({ uri: '' }),
  readFile: async () => ({ data: '' }),
  deleteFile: async () => {},
  mkdir: async () => {},
  readdir: async () => ({ files: [] }),
  stat: async () => ({ type: 'file', size: 0, ctime: 0, mtime: 0, uri: '' }),
}
export const Directory = { Documents: 'DOCUMENTS', Data: 'DATA' }
export const Encoding = { UTF8: 'utf8' }
