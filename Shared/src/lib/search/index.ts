export {
  vectorSearch,
  fullTextSearch,
  type SemanticSearchResult,
} from './semanticSearch'

// Re-export isEmbeddingAvailable and semanticSearch from embedding module
// to avoid duplicate export conflicts in the barrel
// Consumers should import those from the top-level @notepro/shared
