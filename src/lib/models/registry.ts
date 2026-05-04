import { ConfigModelProvider } from '../config/types';
import BaseModelProvider, { createProviderInstance } from './base/provider';
import { getConfiguredModelProviders } from '../config/serverRegistry';
import { providers } from './providers';
import { MinimalProvider, ModelList } from './types';
import configManager from '../config';
import {
  logRequestEvent,
  RequestLogContext,
  serializeError,
} from '../observability/request';
import { withTimeout } from '../utils/async';

const MODEL_LIST_TIMEOUT_MS = 15000;

class ModelRegistry {
  activeProviders: (ConfigModelProvider & {
    provider: BaseModelProvider<any>;
  })[] = [];
  private context?: RequestLogContext;

  constructor(context?: RequestLogContext) {
    this.context = context;
    this.initializeActiveProviders();
  }

  private initializeActiveProviders() {
    const configuredProviders = getConfiguredModelProviders();

    configuredProviders.forEach((p) => {
      try {
        const provider = providers[p.type];
        if (!provider) throw new Error('Invalid provider type');

        this.validateProviderConfig(provider, p);

        this.activeProviders.push({
          ...p,
          provider: createProviderInstance(provider, p.id, p.name, p.config),
        });

        logRequestEvent(this.context, 'provider.initialized', {
          providerId: p.id,
          providerType: p.type,
          providerName: p.name,
        });
      } catch (err) {
        logRequestEvent(
          this.context,
          'provider.initialize_failed',
          {
            providerId: p.id,
            providerType: p.type,
            error: serializeError(err),
          },
          'error',
        );
      }
    });
  }

  async getActiveProviders() {
    const activeProviders = await Promise.all(
      this.activeProviders.map(async (p) => {
        let m: ModelList = { chat: [], embedding: [] };

        try {
          m = await withTimeout(
            p.provider.getModelList(),
            MODEL_LIST_TIMEOUT_MS,
            `Timed out fetching model list for ${p.name}`,
          );
        } catch (err: any) {
          logRequestEvent(
            this.context,
            'provider.model_list_failed',
            {
              providerId: p.id,
              providerType: p.type,
              error: serializeError(err),
            },
            'warn',
          );

          if (p.chatModels.length > 0 || p.embeddingModels.length > 0) {
            m = {
              chat: p.chatModels,
              embedding: p.embeddingModels,
            };
          } else {
            m = {
              chat: [
                {
                  key: 'error',
                  name: err.message,
                },
              ],
              embedding: [],
            };
          }
        }

        return {
          id: p.id,
          name: p.name,
          type: p.type,
          chatModels: this.dedupeModels(m.chat),
          embeddingModels: this.dedupeModels(m.embedding),
        };
      }),
    );

    return activeProviders;
  }

  async loadChatModel(providerId: string, modelName: string) {
    const provider = this.activeProviders.find((p) => p.id === providerId);

    if (!provider) {
      logRequestEvent(
        this.context,
        'provider.chat_model_invalid_provider',
        { providerId, modelName },
        'warn',
      );
      throw new Error('Invalid provider id');
    }

    if (!modelName || modelName === 'error') {
      throw new Error('Invalid chat model key');
    }

    logRequestEvent(this.context, 'provider.chat_model.load_start', {
      providerId,
      providerType: provider.type,
      modelName,
    });

    const model = await provider.provider.loadChatModel(modelName);

    logRequestEvent(this.context, 'provider.chat_model.load_success', {
      providerId,
      providerType: provider.type,
      modelName,
    });

    return model;
  }

  async loadEmbeddingModel(providerId: string, modelName: string) {
    const provider = this.activeProviders.find((p) => p.id === providerId);

    if (!provider) {
      logRequestEvent(
        this.context,
        'provider.embedding_model_invalid_provider',
        { providerId, modelName },
        'warn',
      );
      throw new Error('Invalid provider id');
    }

    if (!modelName || modelName === 'error') {
      throw new Error('Invalid embedding model key');
    }

    logRequestEvent(this.context, 'provider.embedding_model.load_start', {
      providerId,
      providerType: provider.type,
      modelName,
    });

    const model = await provider.provider.loadEmbeddingModel(modelName);

    logRequestEvent(this.context, 'provider.embedding_model.load_success', {
      providerId,
      providerType: provider.type,
      modelName,
    });

    return model;
  }

  async addProvider(
    type: string,
    name: string,
    config: Record<string, any>,
  ): Promise<ConfigModelProvider> {
    const provider = providers[type];
    if (!provider) throw new Error('Invalid provider type');

    const newProvider = configManager.addModelProvider(type, name, config);

    const instance = createProviderInstance(
      provider,
      newProvider.id,
      newProvider.name,
      newProvider.config,
    );

    let m: ModelList = { chat: [], embedding: [] };

    try {
      m = await withTimeout(
        instance.getModelList(),
        MODEL_LIST_TIMEOUT_MS,
        `Timed out fetching model list for ${name}`,
      );
    } catch (err: any) {
      logRequestEvent(
        this.context,
        'provider.add_model_list_failed',
        {
          providerId: newProvider.id,
          providerType: type,
          error: serializeError(err),
        },
        'warn',
      );

      m = {
        chat: [
          {
            key: 'error',
            name: err.message,
          },
        ],
        embedding: [],
      };
    }

    this.activeProviders = this.activeProviders.filter(
      (p) => p.id !== newProvider.id,
    );
    this.activeProviders.push({
      ...newProvider,
      provider: instance,
    });

    if (this.hasUsableModels(m)) {
      configManager.updateProviderModels(
        newProvider.id,
        m.chat || [],
        m.embedding || [],
      );
    }

    return {
      ...newProvider,
      chatModels: m.chat || [],
      embeddingModels: m.embedding || [],
    };
  }

  async removeProvider(providerId: string): Promise<void> {
    configManager.removeModelProvider(providerId);
    this.activeProviders = this.activeProviders.filter(
      (p) => p.id !== providerId,
    );

    return;
  }

  async updateProvider(
    providerId: string,
    name: string,
    config: any,
  ): Promise<ConfigModelProvider> {
    const updated = await configManager.updateModelProvider(
      providerId,
      name,
      config,
    );
    const instance = createProviderInstance(
      providers[updated.type],
      providerId,
      name,
      config,
    );

    let m: ModelList = { chat: [], embedding: [] };

    try {
      m = await withTimeout(
        instance.getModelList(),
        MODEL_LIST_TIMEOUT_MS,
        `Timed out fetching model list for ${name}`,
      );
    } catch (err: any) {
      logRequestEvent(
        this.context,
        'provider.update_model_list_failed',
        {
          providerId: updated.id,
          providerType: updated.type,
          error: serializeError(err),
        },
        'warn',
      );

      m = {
        chat: [
          {
            key: 'error',
            name: err.message,
          },
        ],
        embedding: [],
      };
    }

    this.activeProviders = this.activeProviders.filter(
      (p) => p.id !== providerId,
    );
    this.activeProviders.push({
      ...updated,
      provider: instance,
    });

    if (this.hasUsableModels(m)) {
      configManager.updateProviderModels(
        updated.id,
        m.chat || [],
        m.embedding || [],
      );
    }

    return {
      ...updated,
      chatModels: m.chat || [],
      embeddingModels: m.embedding || [],
    };
  }

  /* Using async here because maybe in the future we might want to add some validation?? */
  async addProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    model: any,
  ): Promise<any> {
    const addedModel = configManager.addProviderModel(providerId, type, model);
    return addedModel;
  }

  async removeProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    modelKey: string,
  ): Promise<void> {
    configManager.removeProviderModel(providerId, type, modelKey);
    return;
  }

  private dedupeModels(models: ModelList['chat']) {
    const byKey = new Map<string, ModelList['chat'][number]>();
    models
      .filter((model) => model.key && model.key !== 'error')
      .forEach((model) => byKey.set(model.key, model));
    return Array.from(byKey.values());
  }

  private hasUsableModels(modelList: ModelList) {
    return (
      modelList.chat.some((model) => model.key && model.key !== 'error') ||
      modelList.embedding.some((model) => model.key && model.key !== 'error')
    );
  }

  private validateProviderConfig(
    provider: (typeof providers)[string],
    configuredProvider: ConfigModelProvider,
  ) {
    const fields = provider.getProviderConfigFields();
    const missing = fields
      .filter((field) => field.required)
      .filter((field) => !configuredProvider.config[field.key])
      .map((field) => field.key);

    if (missing.length > 0) {
      throw new Error(
        `Provider ${configuredProvider.name} is missing required config: ${missing.join(', ')}`,
      );
    }
  }
}

export default ModelRegistry;
