#!/usr/bin/env node

const baseUrl = process.env.VANE_URL || 'http://localhost:3000';
const iterations = Number(process.env.ITERATIONS || 20);
const query =
  process.env.QUERY ||
  'What is the current date and one recent headline about AI?';
const runChat = process.env.RUN_CHAT === '1';
const stream = process.env.STREAM === '1';

const envModel = {
  chatProviderId: process.env.CHAT_PROVIDER_ID,
  chatModel: process.env.CHAT_MODEL,
  embeddingProviderId: process.env.EMBEDDING_PROVIDER_ID,
  embeddingModel: process.env.EMBEDDING_MODEL,
};

const requestJson = async (path, init = {}, requestId) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}: ${JSON.stringify(body)}`);
  }

  return body;
};

const pickModels = (providers) => {
  const chatProvider =
    providers.find(
      (provider) =>
        provider.id === envModel.chatProviderId &&
        provider.chatModels?.some((model) => model.key === envModel.chatModel),
    ) || providers.find((provider) => provider.chatModels?.length > 0);

  if (!chatProvider) {
    throw new Error('No provider with chat models returned by /api/providers');
  }

  const chatModel =
    chatProvider.chatModels.find((model) => model.key === envModel.chatModel) ||
    chatProvider.chatModels[0];

  const embeddingProvider =
    providers.find(
      (provider) =>
        provider.id === envModel.embeddingProviderId &&
        provider.embeddingModels?.some(
          (model) => model.key === envModel.embeddingModel,
        ),
    ) || providers.find((provider) => provider.embeddingModels?.length > 0);

  const embeddingModel =
    embeddingProvider?.embeddingModels.find(
      (model) => model.key === envModel.embeddingModel,
    ) || embeddingProvider?.embeddingModels[0];

  return {
    chatModel: {
      providerId: chatProvider.id,
      key: chatModel.key,
    },
    embeddingModel: embeddingProvider
      ? {
          providerId: embeddingProvider.id,
          key: embeddingModel.key,
        }
      : null,
  };
};

const readStream = async (res) => {
  const reader = res.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
};

const postChat = async (models, requestId) => {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({
      message: {
        messageId: crypto.randomUUID(),
        chatId: crypto.randomUUID(),
        content: query,
      },
      optimizationMode: 'speed',
      sources: ['web'],
      history: [],
      files: [],
      chatModel: models.chatModel,
      embeddingModel: models.embeddingModel,
      systemInstructions: '',
    }),
  });

  const body = await readStream(res);

  if (!res.ok || body.includes('"type":"error"')) {
    throw new Error(`/api/chat failed: ${res.status} ${body}`);
  }
};

const postSearch = async (models, requestId) => {
  const res = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({
      chatModel: models.chatModel,
      embeddingModel: models.embeddingModel,
      optimizationMode: 'speed',
      sources: ['web'],
      query,
      history: [],
      stream,
    }),
  });

  const body = stream ? await readStream(res) : await res.text();
  let parsed = {};

  if (!stream) {
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = { raw: body };
    }
  }

  if (
    !res.ok ||
    (stream && body.includes('"type":"error"')) ||
    (!stream && parsed.error)
  ) {
    throw new Error(`/api/search failed: ${res.status} ${body}`);
  }
};

let passed = 0;
let failed = 0;

try {
  const { providers } = await requestJson(
    '/api/providers',
    {},
    `provider-repro-preflight-${Date.now()}`,
  );
  pickModels(providers || []);
} catch (err) {
  console.error(
    `[preflight] ${
      err instanceof Error ? err.message : String(err)
    }. Configure at least one chat model provider before running the repro harness.`,
  );
  process.exit(1);
}

for (let index = 0; index < iterations; index += 1) {
  const requestId = `provider-repro-${Date.now()}-${index}`;

  try {
    const { providers } = await requestJson('/api/providers', {}, requestId);
    const models = pickModels(providers || []);

    await postSearch(models, requestId);

    if (runChat) {
      await postChat(models, requestId);
    }

    passed += 1;
    console.log(
      `[pass] ${index + 1}/${iterations} requestId=${requestId} chat=${models.chatModel.providerId}/${models.chatModel.key}`,
    );
  } catch (err) {
    failed += 1;
    console.error(
      `[fail] ${index + 1}/${iterations} requestId=${requestId} ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

console.log(`provider repro complete: passed=${passed} failed=${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
