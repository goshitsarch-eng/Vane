import OpenAI from 'openai';
import z from 'zod';
import OpenAILLM from '../openai/openaiLLM';
import { GenerateObjectInput } from '../../types';
import { repairJson } from '@toolsycc/json-repair';
import { parse } from 'partial-json';
import { Message } from '@/lib/types';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/index.mjs';

type OpenRouterConfig = {
  apiKey: string;
  model: string;
  baseURL?: string;
  options?: any;
};

class OpenRouterLLM extends OpenAILLM {
  declare openAIClient: OpenAI;

  constructor(protected config: OpenRouterConfig) {
    super(config);
  }

  convertToOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.id,
          content: msg.content,
        } as ChatCompletionToolMessageParam;
      } else if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content,
          ...(msg.tool_calls &&
            msg.tool_calls.length > 0 && {
              tool_calls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
        } as ChatCompletionAssistantMessageParam;
      }

      return msg;
    });
  }

  private buildJsonSchemaPrompt(input: GenerateObjectInput): string {
    const jsonSchema = JSON.stringify(z.toJSONSchema(input.schema), null, 2);
    return `\n\nYou must respond with valid JSON matching this exact schema:\n${jsonSchema}\n\nDo not include any markdown formatting or code blocks. Respond with raw JSON only.`;
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    const messages = this.convertToOpenAIMessages(input.messages);

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
      messages[messages.length - 1] = {
        ...lastMessage,
        content: `${lastMessage.content}${this.buildJsonSchemaPrompt(input)}`,
      };
    }

    const response = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      messages: messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 0.1,
      top_p: input.options?.topP ?? this.config.options?.topP,
      max_completion_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens,
      response_format: { type: 'json_object' },
    });

    if (response.choices && response.choices.length > 0) {
      try {
        const raw = response.choices[0].message.content!;
        const repaired = repairJson(raw, { extractJson: true }) as string;
        return input.schema.parse(JSON.parse(repaired)) as T;
      } catch (err) {
        throw new Error(`Error parsing response from OpenRouter: ${err}`);
      }
    }

    throw new Error('No response from OpenRouter');
  }

  async *streamObject<T>(input: GenerateObjectInput): AsyncGenerator<T> {
    const messages = this.convertToOpenAIMessages(input.messages);

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
      messages[messages.length - 1] = {
        ...lastMessage,
        content: `${lastMessage.content}${this.buildJsonSchemaPrompt(input)}`,
      };
    }

    const stream = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      messages: messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 0.1,
      top_p: input.options?.topP ?? this.config.options?.topP,
      max_completion_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens,
      response_format: { type: 'json_object' },
      stream: true,
    });

    let receivedObj = '';

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const delta = chunk.choices[0].delta.content || '';
        receivedObj += delta;

        try {
          if (receivedObj.trim()) {
            yield parse(receivedObj) as T;
          }
        } catch {
          yield {} as T;
        }
      }
    }

    try {
      if (receivedObj.trim()) {
        yield parse(receivedObj) as T;
      }
    } catch (err) {
      throw new Error(`Error parsing streamed response from OpenRouter: ${err}`);
    }
  }
}

export default OpenRouterLLM;
