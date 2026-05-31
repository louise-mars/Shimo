export {
  makeAssetUri,
  parseAssetUri,
  createImageStore,
  TauriImageStore,
  CapacitorImageStore,
  IndexedDBImageStore,
} from './imageStore'

export type { IImageStore, ImageMetadata } from './imageStore'

export {
  compressImage,
  shouldCompress,
  shouldUseNativeStorage,
  COMPRESS_THRESHOLD,
  NATIVE_STORAGE_THRESHOLD,
  TARGET_SIZE,
} from './compression'

export type { CompressImageOptions } from './compression'
