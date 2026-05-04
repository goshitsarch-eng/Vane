import BaseLLM from '../../base/llm';
import z from 'zod';
import {
  GenerateObjectInput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
  Tool,
  ToolCall,
} from '../../types';
import { Message } from '@/lib/types';
import { parse } from 'partial-json';
import { repairJson } from '@toolsycc/json-repair';

type AnthropicConfig = {
  apiKey: string;
  model: string;
  baseURL?: string;
  options?: GenerateOptions;
};

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

class AnthropicLLM extends BaseLLM<AnthropicConfig> {
  constructor(protected config: AnthropicConfig) {
    super(config);
  }

  private get baseURL(): string {
    return (this.config.baseURL || 'https://api.anthropic.com/v1').replace(
      /\/+$/,
      '',
    );
  }

  private convertTools(tools: Tool[] | undefined) {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: z.toJSONSchema(tool.schema),
    }));
  }

  convertToAnthropicMessages(messages: Message[]): {
    system: string;
    messages: AnthropicMessage[];
  } {
    let system = '';
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += msg.content + '\n';
      } else if (msg.role === 'tool') {
        // Anthropic doesn't have a 'tool' role; tool results go in a user message
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.id,
              content: msg.content,
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        const content: AnthropicContentBlock[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }
        anthropicMessages.push({
          role: 'assistant',
          content: content.length > 0 ? content : '',
        });
      } else {
        anthropicMessages.push({
          role: 'user',
          content: msg.content,
        });
      }
    }

    return { system: system.trim(), messages: anthropicMessages };
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const { system, messages } = this.convertToAnthropicMessages(
      input.messages,
    );

    const body: any = {
      model: this.config.model,
      max_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens ?? 4096,
      messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: input.options?.topP ?? this.config.options?.topP,
    };

    if (system) body.system = system;
    const tools = this.convertTools(input.tools);
    if (tools) body.tools = tools;
    if (input.options?.stopSequences || this.config.options?.stopSequences) {
      body.stop_sequences =
        input.options?.stopSequences ?? this.config.options?.stopSequences;
    }

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error: ${text}`);
    }

    const data = await res.json();

    const content =
      data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') || '';

    const toolCalls: ToolCall[] =
      data.content
        ?.filter((c: any) => c.type === 'tool_use')
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          arguments: c.input,
        })) || [];

    return {
      content,
      toolCalls,
      additionalInfo: {
        finishReason: data.stop_reason,
        usage: data.usage,
      },
    };
  }

  async *streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput> {
    const { system, messages } = this.convertToAnthropicMessages(
      input.messages,
    );

    const body: any = {
      model: this.config.model,
      max_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens ?? 4096,
      messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: input.options?.topP ?? this.config.options?.topP,
      stream: true,
    };

    if (system) body.system = system;
    const tools = this.convertTools(input.tools);
    if (tools) body.tools = tools;
    if (input.options?.stopSequences || this.config.options?.stopSequences) {
      body.stop_sequences =
        input.options?.stopSequences ?? this.config.options?.stopSequences;
    }

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error: ${text}`);
    }

    if (!res.body) {
      throw new Error('Anthropic API returned empty response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; argumentsBuffer: string }
    >();
    let doneEmitted = false;

    const parseToolArguments = (argumentsBuffer: string) => {
      if (!argumentsBuffer.trim()) return {};

      try {
        return parse(argumentsBuffer);
      } catch {
        try {
          return JSON.parse(
            repairJson(argumentsBuffer, { extractJson: true }) as string,
          );
        } catch {
          return {};
        }
      }
    };

    const buildToolCall = (toolCall: {
      id: string;
      name: string;
      argumentsBuffer: string;
    }): ToolCall => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: parseToolArguments(toolCall.argumentsBuffer),
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const eventData = line.slice(6).trim();
        if (!eventData) continue;

        try {
          const event = JSON.parse(eventData);

          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              yield {
                contentChunk: event.delta.text || '',
                toolCallChunk: [],
                done: false,
                additionalInfo: {},
              };
            } else if (event.delta?.type === 'input_json_delta') {
              const toolCall = toolCallsByIndex.get(event.index);

              if (toolCall) {
                toolCall.argumentsBuffer += event.delta.partial_json || '';
                yield {
                  contentChunk: '',
                  toolCallChunk: [buildToolCall(toolCall)],
                  done: false,
                  additionalInfo: {},
                };
              }
            }
          } else if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              const initialInput =
                event.content_block.input &&
                Object.keys(event.content_block.input).length > 0
                  ? JSON.stringify(event.content_block.input)
                  : '';

              toolCallsByIndex.set(event.index, {
                id: event.content_block.id,
                name: event.content_block.name,
                argumentsBuffer: initialInput,
              });
            }
          } else if (event.type === 'content_block_stop') {
            const toolCall = toolCallsByIndex.get(event.index);

            if (toolCall) {
              yield {
                contentChunk: '',
                toolCallChunk: [buildToolCall(toolCall)],
                done: false,
                additionalInfo: {},
              };
            }
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) {
              yield {
                contentChunk: '',
                toolCallChunk: [],
                done: true,
                additionalInfo: {
                  finishReason: event.delta.stop_reason,
                },
              };
              doneEmitted = true;
            }
          } else if (event.type === 'message_stop') {
            // Final stop
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }

    if (!doneEmitted) {
      yield {
        contentChunk: '',
        toolCallChunk: [],
        done: true,
        additionalInfo: {},
      };
    }
  }

  private buildJsonSchemaPrompt(input: GenerateObjectInput): string {
    const jsonSchema = JSON.stringify(z.toJSONSchema(input.schema), null, 2);
    return `\n\nYou must respond with valid JSON matching this exact schema:\n${jsonSchema}\n\nDo not include any markdown formatting or code blocks. Respond with raw JSON only.`;
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    const { system, messages } = this.convertToAnthropicMessages(
      input.messages,
    );

    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg &&
      lastMsg.role === 'user' &&
      typeof lastMsg.content === 'string'
    ) {
      messages[messages.length - 1] = {
        ...lastMsg,
        content: `${lastMsg.content}${this.buildJsonSchemaPrompt(input)}`,
      };
    }

    const body: any = {
      model: this.config.model,
      max_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens ?? 4096,
      messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 0.1,
      top_p: input.options?.topP ?? this.config.options?.topP,
    };

    if (system) body.system = system;

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error: ${text}`);
    }

    const data = await res.json();

    const rawContent =
      data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') || '';

    try {
      const repaired = repairJson(rawContent, { extractJson: true }) as string;
      return input.schema.parse(JSON.parse(repaired)) as T;
    } catch (err) {
      throw new Error(`Error parsing response from Anthropic: ${err}`);
    }
  }

  async *streamObject<T>(input: GenerateObjectInput): AsyncGenerator<T> {
    const { system, messages } = this.convertToAnthropicMessages(
      input.messages,
    );

    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg &&
      lastMsg.role === 'user' &&
      typeof lastMsg.content === 'string'
    ) {
      messages[messages.length - 1] = {
        ...lastMsg,
        content: `${lastMsg.content}${this.buildJsonSchemaPrompt(input)}`,
      };
    }

    const body: any = {
      model: this.config.model,
      max_tokens:
        input.options?.maxTokens ?? this.config.options?.maxTokens ?? 4096,
      messages,
      temperature:
        input.options?.temperature ?? this.config.options?.temperature ?? 0.1,
      top_p: input.options?.topP ?? this.config.options?.topP,
      stream: true,
    };

    if (system) body.system = system;

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error: ${text}`);
    }

    if (!res.body) {
      throw new Error('Anthropic API returned empty response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedObj = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const eventData = line.slice(6).trim();
        if (!eventData) continue;

        try {
          const event = JSON.parse(eventData);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            receivedObj += event.delta.text;
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }

      try {
        if (receivedObj.trim()) {
          yield parse(receivedObj) as T;
        }
      } catch {
        yield {} as T;
      }
    }

    try {
      if (receivedObj.trim()) {
        yield parse(receivedObj) as T;
      }
    } catch (err) {
      throw new Error(`Error parsing streamed response from Anthropic: ${err}`);
    }
  }
}

export default AnthropicLLM;
