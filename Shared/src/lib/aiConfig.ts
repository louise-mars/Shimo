/**
 * AI 提供商配置（共享）
 * 所有提供商均兼容 OpenAI SDK 格式，baseURL 不同
 */

export type AIProvider = 'minimax' | 'kimi' | 'glm' | 'qwen' | 'openrouter'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
}

export interface ProviderInfo {
  id: AIProvider
  name: string
  desc: string
  baseURL: string
  keyUrl: string
  models: Array<{ id: string; label: string }>
  defaultModel: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'glm',
    name: '智谱 GLM',
    desc: '清华系大模型，综合能力强，有免费额度',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4 Flash（推荐，免费）' },
      { id: 'glm-4', label: 'GLM-4' },
      { id: 'glm-4-plus', label: 'GLM-4 Plus' },
    ],
    defaultModel: 'glm-4-flash',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    desc: '聚合平台，多个免费模型可选',
    baseURL: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3（免费）' },
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1（免费）' },
      { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash（免费）' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    desc: '中文能力强，价格低',
    baseURL: 'https://api.minimaxi.chat/v1',
    keyUrl: 'https://platform.minimaxi.chat',
    models: [
      { id: 'MiniMax-Text-01', label: 'MiniMax Text-01（推荐）' },
      { id: 'abab6.5s-chat', label: 'ABAB 6.5s' },
    ],
    defaultModel: 'MiniMax-Text-01',
  },
  {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    desc: '长文本理解强，128K 上下文',
    baseURL: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn',
    models: [
      { id: 'moonshot-v1-8k', label: 'Moonshot V1 8K（推荐）' },
      { id: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
    ],
    defaultModel: 'moonshot-v1-8k',
  },
  {
    id: 'qwen',
    name: '通义千问',
    desc: '阿里大模型，中文优秀',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://dashscope.console.aliyun.com',
    models: [
      { id: 'qwen-turbo', label: 'Qwen Turbo（推荐）' },
      { id: 'qwen-plus', label: 'Qwen Plus' },
    ],
    defaultModel: 'qwen-turbo',
  },
]

const CONFIG_KEY = 'shimo-ai-config'

export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearAIConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

export function isAIConfigured(): boolean {
  const config = loadAIConfig()
  return !!config?.apiKey && !!config?.provider
}

export function getProviderInfo(provider: AIProvider): ProviderInfo {
  return PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]
}

export function getProviderBaseURL(provider: AIProvider): string {
  return getProviderInfo(provider).baseURL
}
