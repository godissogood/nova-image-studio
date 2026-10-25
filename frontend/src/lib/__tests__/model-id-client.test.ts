import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchModelIds } from '@/lib/model-id-client';

describe('model ID list client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the API key to the same-origin proxy and parses returned model IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchModelIds({ apiKey: 'test-only-key', protocol: 'openai' })).resolves.toEqual(['gpt-6.1-sol']);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/nova/proxy/models');
    expect(url).not.toContain('test-only-key');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toMatchObject({ apiKey: 'test-only-key', protocol: 'openai' });
  });

  it('returns a bounded upstream error message for a failed model list request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API Key 无效' } }), { status: 401 })));

    await expect(fetchModelIds({ apiKey: 'test-only-key', protocol: 'openai' })).rejects.toThrow('API Key 无效');
  });
});
