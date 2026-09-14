import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamAgentChat, type StreamAgentCallbacks } from '@/lib/agent-chat-client';
import { streamPromptOptimize } from '@/lib/prompt-optimize-client';
import { buildSimpleProxyTextRequestBody } from '@/lib/nova-proxy-text';

vi.mock('@/lib/model-endpoints', () => ({ getConfiguredTextModel: () => undefined }));

const input = {
  apiKey: 'test', model: 'gpt-5.6-terra', protocol: 'openai-responses' as const,
  history: [], catalog: [], modelCatalog: [],
};
const callbacks = (): StreamAgentCallbacks => ({
  onDelta: vi.fn(), onReasoning: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onRetry: vi.fn(),
});
let stream: ReadableStreamDefaultController<Uint8Array>;
const emit = (text: string) => stream.enqueue(new TextEncoder().encode(text));
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
        init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Agent stream timeouts and effort', () => {
  it('keeps an active SSE stream alive past the old deadline, including comment keepalives', async () => {
    const cb = callbacks();
    const handle = streamAgentChat(input, cb);
    await vi.advanceTimersByTimeAsync(80_000);
    emit(': keepalive\n\n');
    await vi.advanceTimersByTimeAsync(100_000);
    emit(': keepalive\n\n');
    await vi.advanceTimersByTimeAsync(100_000);
    emit('data: {"type":"response.output_text.delta","delta":"完成"}\n\n');
    emit('data: [DONE]\n\n');
    stream.close();
    await handle.promise;
    expect(cb.onDone).toHaveBeenCalledWith('完成', null);
    expect(cb.onError).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).requestBody.reasoning.effort).toBe('medium');
  });

  it('reports idle timeout without silently launching a second request', async () => {
    const cb = callbacks();
    const handle = streamAgentChat(input, cb);
    await vi.advanceTimersByTimeAsync(180_001);
    await handle.promise;
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('180') }));
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not restart a stream after partial output and a network error', async () => {
    const cb = callbacks();
    const handle = streamAgentChat(input, cb);
    await vi.advanceTimersByTimeAsync(1);
    emit('data: {"type":"response.output_text.delta","delta":"部分内容"}\n\n');
    await vi.advanceTimersByTimeAsync(1);
    stream.error(new Error('network failure'));
    await handle.promise;
    expect(cb.onError).toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports optimizer timeout instead of swallowing it as a user cancellation', async () => {
    const cb = { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const handle = streamPromptOptimize({ apiKey: 'test', mode: 'agent', prompt: '优化' }, cb);
    await vi.advanceTimersByTimeAsync(120_001);
    await handle.promise;
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('120') }));
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).requestBody.reasoning.effort).toBe('low');
  });

  it('forwards the requested effort to compatible Chat models', () => {
    expect(buildSimpleProxyTextRequestBody('openai-chat-completions', 'grok-4.6', [], { reasoningEffort: 'low' }))
      .toMatchObject({ reasoning_effort: 'low' });
  });
});
