import { ModelProviderUISection } from '@/lib/config/types';
import { ProviderConstructor } from '../base/provider';
import OpenAIProvider from './openai';
import OllamaProvider from './ollama';
import GeminiProvider from './gemini';
import TransformersProvider from './transformers';
import GroqProvider from './groq';
import LemonadeProvider from './lemonade';
import AnthropicProvider from './anthropic';
import LMStudioProvider from './lmstudio';
import OpenRouterProvider from './openrouter';
import GenericProvider from './generic';
import LiteLLMProvider from './litellm';

export const providers: Record<string, ProviderConstructor<any>> = {
  openai: OpenAIProvider,
  ollama: OllamaProvider,
  gemini: GeminiProvider,
  transformers: TransformersProvider,
  groq: GroqProvider,
  lemonade: LemonadeProvider,
  anthropic: AnthropicProvider,
  lmstudio: LMStudioProvider,
  openrouter: OpenRouterProvider,
  generic: GenericProvider,
  litellm: LiteLLMProvider,
};

export const getModelProvidersUIConfigSection =
  (): ModelProviderUISection[] => {
    return Object.entries(providers).map(([k, p]) => {
      const configFields = p.getProviderConfigFields();
      const metadata = p.getProviderMetadata();

      return {
        fields: configFields,
        key: k,
        name: metadata.name,
      };
    });
  };
