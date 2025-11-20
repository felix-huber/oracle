import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageCreateParams,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages.mjs';
import type { ClientLike, ModelName, OracleRequestBody, OracleResponse, ResponseStreamLike } from './types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

function buildAnthropicParams(body: OracleRequestBody, model: string): MessageCreateParams {
  const userText = (body.input ?? [])
    .flatMap((item) =>
      (item.content ?? [])
        .map((piece) => (piece && typeof piece === 'object' && 'text' in piece ? (piece as { text?: string }).text ?? '' : ''))
        .filter(Boolean),
    )
    .join('\n\n');

  const params: MessageCreateParams = {
    model,
    max_tokens: body.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userText }],
      },
    ],
  };

  if (body.instructions && body.instructions.trim().length > 0) {
    params.system = body.instructions;
  }

  // web_search_preview / tools unsupported for Anthropic (ignored intentionally).
  return params;
}

function messageToOracleResponse(message: Message, aggregatedText?: string): OracleResponse {
  const textParts = extractTextBlocks(message);
  const outputText = textParts.length > 0 ? textParts : aggregatedText ? [aggregatedText] : [];
  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;

  return {
    id: message.id,
    status: 'completed',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      reasoning_tokens: 0,
      total_tokens: inputTokens + outputTokens,
    },
    output_text: outputText,
    output: outputText.map((text) => ({ type: 'text', text })),
  };
}

export function createAnthropicClient(
  apiKey: string,
  modelName: ModelName = 'claude-4.5-sonnet',
  resolvedModelId?: string,
  baseUrl?: string,
): ClientLike {
  const client = new Anthropic({ apiKey, baseURL: baseUrl });
  const model = resolvedModelId ?? modelName;

  const streamResponses = (body: OracleRequestBody): ResponseStreamLike => {
    const params = buildAnthropicParams(body, model);
    let finalMessagePromise: Promise<Message> | null = null;

    async function* generator() {
      const stream = (await client.messages.stream(params)) as Awaited<
        ReturnType<typeof client.messages.stream>
      >;
      finalMessagePromise = stream.finalMessage().then((msg) => msg as Message);
      for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          typeof event.delta.text === 'string'
        ) {
          const deltaText = event.delta.text;
          if (deltaText) {
            yield { type: 'chunk', delta: deltaText };
          }
        }
      }
    }

    const iterator = generator();

    return {
      [Symbol.asyncIterator]: () => iterator,
      finalResponse: async () => {
        if (!finalMessagePromise) {
          for await (const _ of iterator) {
            // no-op; ensure stream started
          }
        }
        const message = (await (finalMessagePromise ?? (client.messages.create(params) as Promise<unknown>))) as Message;
        const aggregatedText = extractTextBlocks(message).join('');
        return messageToOracleResponse(message, aggregatedText);
      },
    };
  };

  return {
    responses: {
      stream: streamResponses,
      create: async (body: OracleRequestBody) => {
        const params = buildAnthropicParams(body, model);
        const message = (await client.messages.create(params)) as Message;
        const aggregatedText = extractTextBlocks(message).join('');
        return messageToOracleResponse(message, aggregatedText);
      },
      retrieve: async (id: string) => ({
        id,
        status: 'error',
        error: { message: 'Retrieve by ID not supported for Anthropic API yet.' },
      }),
    },
  };
}

function extractTextBlocks(message: Message): string[] {
  return (message.content ?? []).flatMap((block) => (block.type === 'text' && block.text ? [block.text] : []));
}
