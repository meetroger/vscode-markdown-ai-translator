import { buildSystemPrompt } from './prompt';

export type Provider = 'openai-compatible' | 'anthropic';

export interface TranslatorConfig {
  provider: Provider;
  endpoint: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
  additionalInstructions: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  extraHeaders: Record<string, string>;
}

export type ChunkHandler = (chunk: string) => void;

export async function translate(
  config: TranslatorConfig,
  source: string,
  onChunk: ChunkHandler,
  signal: AbortSignal,
  targetLanguageOverride?: string,
): Promise<void> {
  const targetLanguage = (targetLanguageOverride ?? config.targetLanguage).trim();
  const system = buildSystemPrompt(targetLanguage, config.additionalInstructions);
  if (config.provider === 'anthropic') {
    return translateAnthropic(config, system, source, onChunk, signal);
  }
  return translateOpenAI(config, system, source, onChunk, signal);
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

function mergeHeaders(extra: Record<string, string>, base: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
}

async function translateOpenAI(
  config: TranslatorConfig,
  system: string,
  source: string,
  onChunk: ChunkHandler,
  signal: AbortSignal,
): Promise<void> {
  const url = joinUrl(config.endpoint, '/chat/completions');
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: source },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: config.stream,
  };
  const headers = mergeHeaders(config.extraHeaders, {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(`LLM request failed (${res.status} ${res.statusText}): ${await safeText(res)}`);
  }

  if (!config.stream) {
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    if (content) onChunk(content);
    return;
  }

  await consumeSSE(res, (data) => {
    if (data === '[DONE]') return;
    let obj: any;
    try {
      obj = JSON.parse(data);
    } catch {
      return;
    }
    const delta: unknown = obj?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      onChunk(delta);
    }
  });
}

async function translateAnthropic(
  config: TranslatorConfig,
  system: string,
  source: string,
  onChunk: ChunkHandler,
  signal: AbortSignal,
): Promise<void> {
  const url = joinUrl(config.endpoint, '/messages');
  const body = {
    model: config.model,
    system,
    messages: [{ role: 'user', content: source }],
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: config.stream,
  };
  const headers = mergeHeaders(config.extraHeaders, {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Anthropic request failed (${res.status} ${res.statusText}): ${await safeText(res)}`);
  }

  if (!config.stream) {
    const json: any = await res.json();
    const blocks: any[] = json?.content ?? [];
    for (const block of blocks) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        onChunk(block.text);
      }
    }
    return;
  }

  await consumeSSE(res, (data) => {
    let obj: any;
    try {
      obj = JSON.parse(data);
    } catch {
      return;
    }
    if (obj?.type === 'content_block_delta') {
      const text: unknown = obj?.delta?.text;
      if (typeof text === 'string' && text.length > 0) {
        onChunk(text);
      }
    }
  });
}

async function consumeSSE(res: Response, onData: (data: string) => void): Promise<void> {
  if (!res.body) {
    throw new Error('Empty response body from LLM endpoint.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const rawLine = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const line = rawLine.replace(/\r$/, '');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).replace(/^ /, '');
        if (data) onData(data);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return '<no body>'; }
}
