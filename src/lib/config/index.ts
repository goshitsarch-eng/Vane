import path from 'node:path';
import fs from 'fs';
import { Config, ConfigModelProvider, UIConfigSections } from './types';
import { Model } from '../models/types';
import { hashObj } from '../utils/hash';
import { getModelProvidersUIConfigSection } from '../models/providers';
import { dataPath } from '../paths';
import { writeJsonAtomicSync } from '../utils/atomic';

class ConfigManager {
  configPath: string = dataPath('config.json');
  configVersion = 1;
  currentConfig: Config = {
    version: this.configVersion,
    setupComplete: false,
    preferences: {},
    personalization: {},
    modelProviders: [],
    search: {
      searxngURL: '',
    },
  };
  uiConfigSections: UIConfigSections = {
    preferences: [
      {
        name: 'Theme',
        key: 'theme',
        type: 'select',
        options: [
          {
            name: 'Light',
            value: 'light',
          },
          {
            name: 'Dark',
            value: 'dark',
          },
        ],
        required: false,
        description: 'Choose between light and dark layouts for the app.',
        default: 'dark',
        scope: 'client',
      },
      {
        name: 'Measurement Unit',
        key: 'measureUnit',
        type: 'select',
        options: [
          {
            name: 'Imperial',
            value: 'Imperial',
          },
          {
            name: 'Metric',
            value: 'Metric',
          },
        ],
        required: false,
        description: 'Choose between Metric  and Imperial measurement unit.',
        default: 'Metric',
        scope: 'client',
      },
      {
        name: 'Auto video & image search',
        key: 'autoMediaSearch',
        type: 'switch',
        required: false,
        description: 'Automatically search for relevant images and videos.',
        default: true,
        scope: 'client',
      },
      {
        name: 'Show weather widget',
        key: 'showWeatherWidget',
        type: 'switch',
        required: false,
        description: 'Display the weather card on the home screen.',
        default: true,
        scope: 'client',
      },
      {
        name: 'Show news widget',
        key: 'showNewsWidget',
        type: 'switch',
        required: false,
        description: 'Display the recent news card on the home screen.',
        default: true,
        scope: 'client',
      },
    ],
    personalization: [
      {
        name: 'System Instructions',
        key: 'systemInstructions',
        type: 'textarea',
        required: false,
        description: 'Add custom behavior or tone for the model.',
        placeholder:
          'e.g., "Respond in a friendly and concise tone" or "Use British English and format answers as bullet points."',
        scope: 'client',
      },
    ],
    modelProviders: [],
    search: [
      {
        name: 'Search Backend',
        key: 'backend',
        type: 'select',
        required: true,
        description: 'Choose which search API to use for web search',
        default: 'searxng',
        scope: 'server',
        env: 'SEARCH_BACKEND',
        options: [
          { name: 'SearXNG (self-hosted)', value: 'searxng' },
          { name: 'Brave Search API', value: 'brave' },
          { name: 'Exa API', value: 'exa' },
          { name: 'Tavily API', value: 'tavily' },
        ],
      },
      {
        name: 'SearXNG URL',
        key: 'searxngURL',
        type: 'string',
        required: false,
        description: 'The URL of your SearXNG instance',
        placeholder: 'http://localhost:4000',
        default: '',
        scope: 'server',
        env: 'SEARXNG_API_URL',
      },
      {
        name: 'Brave Search API Key',
        key: 'braveApiKey',
        type: 'password',
        required: false,
        description:
          'Your Brave Search API key (required when using Brave backend)',
        placeholder: 'Brave API Key',
        default: '',
        scope: 'server',
        env: 'BRAVE_API_KEY',
      },
      {
        name: 'Exa API Key',
        key: 'exaApiKey',
        type: 'password',
        required: false,
        description: 'Your Exa API key (required when using Exa backend)',
        placeholder: 'Exa API Key',
        default: '',
        scope: 'server',
        env: 'EXA_API_KEY',
      },
      {
        name: 'Tavily API Key',
        key: 'tavilyApiKey',
        type: 'password',
        required: false,
        description: 'Your Tavily API key (required when using Tavily backend)',
        placeholder: 'Tavily API Key',
        default: '',
        scope: 'server',
        env: 'TAVILY_API_KEY',
      },
    ],
  };

  constructor() {
    this.initialize();
  }

  private initialize() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    this.initializeConfig();
    this.initializeFromEnv();
  }

  private saveConfig() {
    writeJsonAtomicSync(this.configPath, this.currentConfig);
  }

  private initializeConfig() {
    const exists = fs.existsSync(this.configPath);
    if (!exists) {
      this.saveConfig();
    } else {
      try {
        this.currentConfig = JSON.parse(
          fs.readFileSync(this.configPath, 'utf-8'),
        );
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.error(
            `Error parsing config file at ${this.configPath}:`,
            err,
          );
          console.log(
            'Loading default config and overwriting the existing file.',
          );
          this.saveConfig();
          return;
        } else {
          console.log('Unknown error reading config file:', err);
        }
      }

      this.currentConfig = this.migrateConfig(this.currentConfig);
    }
  }

  private migrateConfig(config: Config): Config {
    return {
      version: config.version ?? this.configVersion,
      setupComplete: Boolean(config.setupComplete),
      preferences: config.preferences ?? {},
      personalization: config.personalization ?? {},
      modelProviders: Array.isArray(config.modelProviders)
        ? config.modelProviders.map((provider) => ({
            ...provider,
            chatModels: this.filterUsableModels(provider.chatModels || []),
            embeddingModels: this.filterUsableModels(
              provider.embeddingModels || [],
            ),
          }))
        : [],
      search: config.search ?? {},
    };
  }

  private initializeFromEnv() {
    /* providers section*/
    const providerConfigSections = getModelProvidersUIConfigSection();

    this.uiConfigSections.modelProviders = providerConfigSections;

    const newProviders: ConfigModelProvider[] = [];

    providerConfigSections.forEach((provider) => {
      const newProvider: ConfigModelProvider & { required?: string[] } = {
        id: crypto.randomUUID(),
        name: `${provider.name}`,
        type: provider.key,
        chatModels: [],
        embeddingModels: [],
        config: {},
        required: [],
        hash: '',
      };

      provider.fields.forEach((field) => {
        newProvider.config[field.key] =
          process.env[field.env!] ||
          field.default ||
          ''; /* Env var must exist for providers */

        if (field.required) newProvider.required?.push(field.key);
      });

      let configured = true;

      newProvider.required?.forEach((r) => {
        if (!newProvider.config[r]) {
          configured = false;
        }
      });

      if (configured) {
        const hash = hashObj({ type: newProvider.type, ...newProvider.config });
        newProvider.hash = hash;
        delete newProvider.required;

        const exists = this.currentConfig.modelProviders.find(
          (p) => p.hash === hash,
        );

        if (!exists) {
          newProviders.push(newProvider);
        }
      }
    });

    if (newProviders.length > 0) {
      this.currentConfig.modelProviders = [
        ...this.currentConfig.modelProviders,
        ...newProviders,
      ];
    }

    /* search section */
    this.uiConfigSections.search.forEach((f) => {
      if (f.env && !this.currentConfig.search[f.key]) {
        this.currentConfig.search[f.key] =
          process.env[f.env] ?? f.default ?? '';
      }
    });

    /* Sync SEARCH_BACKEND env var bidirectionally with config */
    if (process.env.SEARCH_BACKEND) {
      this.currentConfig.search.backend = process.env.SEARCH_BACKEND;
    } else if (this.currentConfig.search.backend) {
      process.env.SEARCH_BACKEND = this.currentConfig.search.backend;
    }

    this.saveConfig();
  }

  public getConfig(key: string, defaultValue?: any): any {
    const nested = key.split('.');
    let obj: any = this.currentConfig;

    for (let i = 0; i < nested.length; i++) {
      const part = nested[i];
      if (obj == null) return defaultValue;

      obj = obj[part];
    }

    return obj === undefined ? defaultValue : obj;
  }

  public updateConfig(key: string, val: any) {
    const parts = key.split('.');
    if (parts.length === 0) return;

    let target: any = this.currentConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (target[part] === null || typeof target[part] !== 'object') {
        target[part] = {};
      }

      target = target[part];
    }

    const finalKey = parts[parts.length - 1];
    target[finalKey] = val;

    this.saveConfig();
  }

  public addModelProvider(type: string, name: string, config: any) {
    const hash = hashObj({ type, ...config });
    const existingProvider = this.currentConfig.modelProviders.find(
      (provider) => provider.hash === hash,
    );

    if (existingProvider) {
      return existingProvider;
    }

    const newModelProvider: ConfigModelProvider = {
      id: crypto.randomUUID(),
      name,
      type,
      config,
      chatModels: [],
      embeddingModels: [],
      hash,
    };

    this.currentConfig.modelProviders.push(newModelProvider);
    this.saveConfig();

    return newModelProvider;
  }

  public updateProviderModels(
    providerId: string,
    chatModels: Model[],
    embeddingModels: Model[],
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) return;

    provider.chatModels = this.mergeModels(provider.chatModels, chatModels);
    provider.embeddingModels = this.mergeModels(
      provider.embeddingModels,
      embeddingModels,
    );
    this.saveConfig();
  }

  public removeModelProvider(id: string) {
    const index = this.currentConfig.modelProviders.findIndex(
      (p) => p.id === id,
    );

    if (index === -1) return;

    this.currentConfig.modelProviders =
      this.currentConfig.modelProviders.filter((p) => p.id !== id);

    this.saveConfig();
  }

  public async updateModelProvider(id: string, name: string, config: any) {
    const provider = this.currentConfig.modelProviders.find((p) => {
      return p.id === id;
    });

    if (!provider) throw new Error('Provider not found');

    provider.name = name;
    provider.config = config;
    provider.hash = hashObj({ type: provider.type, ...config });

    this.saveConfig();

    return provider;
  }

  public addProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    model: any,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    delete model.type;

    if (type === 'chat') {
      provider.chatModels.push(model);
    } else {
      provider.embeddingModels.push(model);
    }

    this.saveConfig();

    return model;
  }

  public removeProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    modelKey: string,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    if (type === 'chat') {
      provider.chatModels = provider.chatModels.filter(
        (m) => m.key !== modelKey,
      );
    } else {
      provider.embeddingModels = provider.embeddingModels.filter(
        (m) => m.key != modelKey,
      );
    }

    this.saveConfig();
  }

  public isSetupComplete() {
    return this.currentConfig.setupComplete;
  }

  public markSetupComplete() {
    if (!this.currentConfig.setupComplete) {
      this.currentConfig.setupComplete = true;
    }

    this.saveConfig();
  }

  public getUIConfigSections(): UIConfigSections {
    return this.uiConfigSections;
  }

  public getCurrentConfig(): Config {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }

  private mergeModels(existingModels: Model[], discoveredModels: Model[]) {
    const byKey = new Map<string, Model>();

    this.filterUsableModels(existingModels).forEach((model) =>
      byKey.set(model.key, model),
    );
    this.filterUsableModels(discoveredModels).forEach((model) =>
      byKey.set(model.key, model),
    );

    return Array.from(byKey.values());
  }

  private filterUsableModels(models: Model[]) {
    return models.filter((model) => model.key && model.key !== 'error');
  }
}

const configManager = new ConfigManager();

export default configManager;
