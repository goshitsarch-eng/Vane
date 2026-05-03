import { UIConfigField } from '@/lib/config/types';
import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';
import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import LiteLLMLLM from './litellmLLM';
import LiteLLMEmbedding from './litellmEmbedding';

interface LiteLLMConfig {
  baseURL: string;
  apiKey?: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'string',
    name: 'Base URL',
    key: 'baseURL',
    description: 'The base URL for the LiteLLM proxy',
    required: true,
    placeholder: 'http://localhost:4000',
    env: 'LITELLM_BASE_URL',
    scope: 'server',
  },
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your LiteLLM proxy API key (optional)',
    required: false,
    placeholder: 'LiteLLM API Key',
    env: 'LITELLM_API_KEY',
    scope: 'server',
  },
];

class LiteLLMProvider extends BaseModelProvider<LiteLLMConfig> {
  constructor(id: string, name: string, config: LiteLLMConfig) {
    super(id, name, config);
  }

  private normalizeBaseURL(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }

  async getDefaultModels(): Promise<ModelList> {
    try {
      const baseURL = this.normalizeBaseURL(this.config.baseURL);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const res = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        return {
          embedding: [],
          chat: [],
        };
      }

      const data = await res.json();

      if (!data.data || !Array.isArray(data.data)) {
        return {
          embedding: [],
          chat: [],
        };
      }

      const models: Model[] = data.data.map((m: any) => {
        return {
          name: m.id || m.name,
          key: m.id || m.name,
        };
      });

      return {
        embedding: models,
        chat: models,
      };
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(
          'Error connecting to LiteLLM proxy. Please ensure the base URL is correct and the proxy is running.',
        );
      }

      return {
        embedding: [],
        chat: [],
      };
    }
  }

  async getModelList(): Promise<ModelList> {
    const defaultModels = await this.getDefaultModels();
    const configProvider = getConfiguredModelProviderById(this.id)!;

    return {
      embedding: [
        ...defaultModels.embedding,
        ...configProvider.embeddingModels,
      ],
      chat: [...defaultModels.chat, ...configProvider.chatModels],
    };
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();

    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading LiteLLM Chat Model. Invalid Model Selected',
      );
    }

    return new LiteLLMLLM({
      apiKey: this.config.apiKey || 'not-needed',
      model: key,
      baseURL: this.normalizeBaseURL(this.config.baseURL),
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.embedding.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading LiteLLM Embedding Model. Invalid Model Selected.',
      );
    }

    return new LiteLLMEmbedding({
      apiKey: this.config.apiKey || 'not-needed',
      model: key,
      baseURL: this.normalizeBaseURL(this.config.baseURL),
    });
  }

  static parseAndValidate(raw: any): LiteLLMConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.baseURL)
      throw new Error('Invalid config provided. Base URL must be provided');

    return {
      baseURL: String(raw.baseURL),
      apiKey: raw.apiKey ? String(raw.apiKey) : undefined,
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'litellm',
      name: 'LiteLLM',
    };
  }
}

export default LiteLLMProvider;
