const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function extractChatCompletionText(response) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((part) => part.text ?? part.content ?? '')
      .filter(Boolean);
    if (chunks.length > 0) {
      return chunks.join('\n');
    }
  }

  throw new Error('Chat completion response did not contain choices[0].message.content.');
}

export function extractResponsesOutputText(response) {
  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  const chunks = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error('Responses API response did not contain output_text.');
  }

  return chunks.join('\n');
}

export function inferModelProvider(options = {}) {
  if (options.provider) {
    return options.provider;
  }

  if (options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY) {
    return 'openrouter';
  }

  if (options.openAiApiKey ?? process.env.OPENAI_API_KEY) {
    return 'openai';
  }

  return 'openrouter';
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function normalizeUsage(usage) {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? 0,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? 0,
    raw: usage
  };
}

function toChatMessages(request) {
  return [
    request.instructions ? { role: 'system', content: request.instructions } : null,
    ...(request.input ?? [])
  ].filter(Boolean);
}

async function readJsonResponse(response, providerName) {
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${providerName} API request failed with HTTP ${response.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
}

function createOpenRouterClient(options) {
  const apiKey = options.apiKey ?? options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  const baseUrl = options.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? OPENROUTER_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required. Put the project-scoped key in local .env.');
  }

  return {
    async complete(request) {
      const body = compactObject({
        model: request.model,
        messages: toChatMessages(request),
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        reasoning: request.reasoning,
        seed: request.seed,
        stream: false
      });

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: compactObject({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER,
          'X-OpenRouter-Title': process.env.OPENROUTER_TITLE ?? 'CPO Protocol Lab'
        }),
        body: JSON.stringify(body)
      });

      const json = await readJsonResponse(response, 'OpenRouter');
      return {
        text: extractChatCompletionText(json),
        usage: normalizeUsage(json.usage)
      };
    }
  };
}

function createOpenAiResponsesClient(options) {
  const apiKey = options.apiKey ?? options.openAiApiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? OPENAI_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. Put it in local .env or process environment.');
  }

  return {
    async complete(request) {
      const body = compactObject({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        temperature: request.temperature,
        max_output_tokens: request.maxOutputTokens,
        store: false
      });

      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      const json = await readJsonResponse(response, 'OpenAI');
      return {
        text: extractResponsesOutputText(json),
        usage: normalizeUsage(json.usage)
      };
    }
  };
}

export function createModelClient(options = {}) {
  const provider = inferModelProvider(options);

  if (provider === 'openrouter') {
    return createOpenRouterClient(options);
  }

  if (provider === 'openai') {
    return createOpenAiResponsesClient(options);
  }

  throw new Error(`Unsupported model provider: ${provider}`);
}
