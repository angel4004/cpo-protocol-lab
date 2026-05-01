import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelClient,
  extractChatCompletionText,
  extractResponsesOutputText
} from '../src/modelClient.js';

test('extractChatCompletionText reads OpenRouter chat completion content', () => {
  const text = extractChatCompletionText({
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'hello from openrouter'
        }
      }
    ]
  });

  assert.equal(text, 'hello from openrouter');
});

test('createModelClient returns OpenRouter completion text with usage metadata', async () => {
  const client = createModelClient({
    provider: 'openrouter',
    apiKey: 'test-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'ok'
            }
          }
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125
        }
      })
    })
  });

  const result = await client.complete({
    model: 'openai/gpt-5-mini',
    input: [{ role: 'user', content: 'hello' }]
  });

  assert.deepEqual(result, {
    text: 'ok',
    usage: {
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      raw: {
        prompt_tokens: 100,
        completion_tokens: 25,
        total_tokens: 125
      }
    }
  });
});

test('extractResponsesOutputText reads direct output_text from Responses API response', () => {
  assert.equal(extractResponsesOutputText({ output_text: 'hello' }), 'hello');
});

test('extractResponsesOutputText reads nested message output text from Responses API response', () => {
  const text = extractResponsesOutputText({
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'nested hello'
          }
        ]
      }
    ]
  });

  assert.equal(text, 'nested hello');
});

test('createModelClient sends OpenRouter chat completions requests without leaking key in body', async () => {
  const calls = [];
  const client = createModelClient({
    provider: 'openrouter',
    apiKey: 'test-token',
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'ok'
              }
            }
          ]
        })
      };
    }
  });

  const result = await client.complete({
    model: 'openai/gpt-5-mini',
    instructions: 'system instructions',
    input: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' }
    ],
    reasoning: {
      effort: 'minimal',
      exclude: true
    },
    temperature: 0.2,
    maxOutputTokens: 100
  });

  assert.equal(result.text, 'ok');
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].request.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].request.headers['X-OpenRouter-Title'], 'CPO Protocol Lab');

  const body = JSON.parse(calls[0].request.body);
  assert.equal(body.model, 'openai/gpt-5-mini');
  assert.equal(body.temperature, 0.2);
  assert.equal(body.max_tokens, 100);
  assert.deepEqual(body.reasoning, { effort: 'minimal', exclude: true });
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'system instructions' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' }
  ]);
  assert.doesNotMatch(calls[0].request.body, /test-token/);
});
