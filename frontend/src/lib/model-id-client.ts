import { parseUpstreamModelList } from '@/lib/provider-registry';
import { ITOO_API_BASE_URL } from '@/lib/itoo-config';

export async function fetchModelIds(input: {
  apiKey: string;
  protocol: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const response = await fetch('/api/nova/proxy/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: input.signal,
    body: JSON.stringify({
      baseUrl: ITOO_API_BASE_URL,
      protocol: input.protocol,
      apiKey: input.apiKey,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(readModelListError(detail, response.status));
  }

  return parseUpstreamModelList(await response.json());
}

function readModelListError(detail: string, status: number): string {
  const fallback = `读取模型列表失败（${status}）`;
  const raw = String(detail || '').trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    if (parsed.error && typeof parsed.error === 'object') {
      const message = (parsed.error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  } catch {
    if (!raw.startsWith('<')) return raw.slice(0, 180);
  }

  return fallback;
}
