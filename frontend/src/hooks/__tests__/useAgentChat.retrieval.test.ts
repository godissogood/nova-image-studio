import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentImageRecord, AgentMessage } from '@/lib/agent-chat-config';
import type { PendingGenerationData, PendingProposalData } from '@/lib/agent-context-store';
import type { AgentResolvedLayout } from '@/lib/model-capabilities';
import { useAgentChat } from '@/hooks/useAgentChat';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), get: vi.fn(), download: vi.fn(),
  hasApiKey: true,
  state: {
    pending: null as PendingGenerationData | null,
    proposal: null as PendingProposalData | null,
    images: [] as AgentImageRecord[],
    messages: [] as AgentMessage[],
    blobs: new Map<string, Blob>(),
  },
}));

vi.mock('@/lib/settings-storage', () => ({ hasAnyApiKey: () => mocks.hasApiKey }));
vi.mock('@/lib/ccode-task-client', () => ({
  createNovaTask: mocks.create,
  getNovaTask: mocks.get,
  resolveImageTaskProvider: () => ({ apiKey: 'test', baseUrl: 'https://api.itoo.me', protocol: 'grok', modelId: 'grok-imagine-image-2.0' }),
}));
vi.mock('@/lib/image-downloader', () => ({ fetchImageAsBlob: mocks.download }));
vi.mock('@/lib/agent-chat-client', () => ({ describeImage: async () => '图片', streamAgentChat: vi.fn() }));
vi.mock('@/lib/model-endpoints', () => ({
  getDefaultConfiguredTextModel: () => ({ apiKey: 'test', baseUrl: 'https://api.itoo.me', modelId: 'test', protocol: 'openai-responses' }),
}));
vi.mock('@/lib/agent-context-store', () => ({
  loadAgentSession: async () => ({ images: [...mocks.state.images], messages: [...mocks.state.messages], imageModel: null }),
  loadPendingProposal: async () => mocks.state.proposal,
  loadPendingGeneration: async () => mocks.state.pending,
  savePendingGeneration: async (data: PendingGenerationData) => { mocks.state.pending = data; },
  clearPendingGeneration: async () => { mocks.state.pending = null; },
  savePendingProposal: async (data: PendingProposalData) => { mocks.state.proposal = data; },
  clearPendingProposal: async () => { mocks.state.proposal = null; },
  putImageRecord: async (record: AgentImageRecord) => {
    mocks.state.images = [...mocks.state.images.filter(r => r.imgId !== record.imgId), record];
  },
  putMessage: async (message: AgentMessage) => {
    mocks.state.messages = [...mocks.state.messages.filter(m => m.id !== message.id), message];
  },
  storeAgentImageBytes: async (id: string, blob: Blob) => { mocks.state.blobs.set(id, blob); },
  getAgentImageBytes: async (id: string) => mocks.state.blobs.get(id) ?? null,
  getAgentImageBase64: async () => null,
  saveImageModel: vi.fn(), clearAgentSession: vi.fn(), deleteMessages: vi.fn(),
  deleteImageRecords: vi.fn(), deleteAgentImageBytes: vi.fn(),
}));

const params: AgentResolvedLayout = {
  outputSize: '1K', aspectRatio: '1:1', temperature: 1, parallelCount: 1,
  gptImageQuality: 'auto', gptImageStyle: 'auto', gptImageBackground: 'auto',
};
const proposal = { action: 'generate' as const, prompt: '一只公鸡', referencedImageIds: [], reason: '按要求生图' };
const blob = () => new Blob(['test-image'], { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.hasApiKey = true;
  mocks.state.pending = null;
  mocks.state.proposal = { proposal, pendingAnalysis: '分析', pendingReasoning: '', isReedit: false };
  mocks.state.images = [];
  mocks.state.messages = [];
  mocks.state.blobs.clear();
  mocks.create.mockResolvedValue('task-original');
  mocks.get.mockResolvedValue({ id: 'task-original', status: 'completed', result: { images: ['URL:/api/nova/images/task-original/0'] } });
  mocks.download.mockResolvedValue(blob());
});

describe('Agent API key status', () => {
  it('updates when model settings are saved after the Agent mounts', () => {
    mocks.hasApiKey = false;
    const hook = renderHook(() => useAgentChat());
    expect(hook.result.current.hasApiKey).toBe(false);

    mocks.hasApiKey = true;
    act(() => window.dispatchEvent(new Event('nova-model-registry-updated')));

    expect(hook.result.current.hasApiKey).toBe(true);
    hook.unmount();
  });
});

async function startGeneration() {
  const hook = renderHook(() => useAgentChat());
  await waitFor(() => expect(hook.result.current.phase).toBe('proposal'));
  await act(async () => { await hook.result.current.approveProposal(proposal.prompt, [], 'grok-model', params); });
  return hook;
}

describe('Agent generated image recovery', () => {
  it('retains a completed task after download fails and retrieves it without generating again', async () => {
    mocks.download.mockRejectedValueOnce(new Error('HTTP 502'));
    const hook = await startGeneration();
    expect(hook.result.current.phase).toBe('retrieval-failed');
    expect(hook.result.current.generatingTaskId).toBe('task-original');
    expect(hook.result.current.proposal).toBeNull();
    expect(mocks.state.pending).toMatchObject({ taskId: 'task-original', completed: true });
    expect(mocks.state.pending?.retrievalError).toContain('HTTP 502');

    await act(async () => { await hook.result.current.retryRetrieval(); });
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.images).toHaveLength(1);
    expect(mocks.state.pending).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenNthCalledWith(2, 'task-original');
    hook.unmount();
  });

  it('restores partial results after remount and downloads only the missing image', async () => {
    mocks.get.mockResolvedValue({ id: 'task-original', status: 'completed', result: { images: ['URL:/images/0', 'URL:/images/1'] } });
    mocks.download.mockImplementation(async (url: string) => {
      if (url === '/images/1') throw new Error('download failed');
      return blob();
    });
    const first = await startGeneration();
    expect(first.result.current.phase).toBe('retrieval-failed');
    expect(first.result.current.images).toHaveLength(1);
    const savedImageId = first.result.current.images[0].imgId;
    expect(first.result.current.messages).toHaveLength(1);
    first.unmount();

    const second = renderHook(() => useAgentChat());
    await waitFor(() => expect(second.result.current.phase).toBe('retrieval-failed'));
    expect(mocks.download).toHaveBeenCalledTimes(2);
    mocks.download.mockResolvedValue(blob());
    await act(async () => { await Promise.all([second.result.current.retryRetrieval(), second.result.current.retryRetrieval()]); });
    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect(mocks.download).toHaveBeenLastCalledWith('/images/1');
    expect(second.result.current.images).toHaveLength(2);
    expect(second.result.current.images[0].imgId).toBe(savedImageId);
    expect(second.result.current.messages).toHaveLength(1);
    expect(second.result.current.messages[0].imageIds).toHaveLength(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.state.pending).toBeNull();
    second.unmount();
  });

  it('retains the task when polling fails, but permits ending retrieval to continue the conversation', async () => {
    mocks.get.mockRejectedValueOnce(new Error('network interrupted'));
    const hook = await startGeneration();
    expect(hook.result.current.phase).toBe('retrieval-failed');
    expect(mocks.state.pending?.taskId).toBe('task-original');
    await act(async () => { await hook.result.current.dismissRetrieval(); });
    expect(hook.result.current.phase).toBe('idle');
    expect(mocks.state.pending).toBeNull();
    expect(hook.result.current.generationDraft).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('leaves an explicit failed generation editable, instead of pretending it can be downloaded', async () => {
    mocks.get.mockResolvedValue({ id: 'task-original', status: 'failed', error: 'upstream generation failed' });
    const hook = await startGeneration();
    expect(hook.result.current.phase).toBe('proposal');
    expect(hook.result.current.error).toBe('upstream generation failed');
    expect(mocks.state.pending).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('releases expired tasks without creating another generation', async () => {
    mocks.get.mockResolvedValue({ id: 'task-original', status: 'expired' });
    const hook = await startGeneration();
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.error).toContain('已过期');
    expect(hook.result.current.generationDraft).toBeNull();
    expect(mocks.state.pending).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('treats a missing task response as expired while preserving partial images', async () => {
    mocks.get.mockResolvedValueOnce({ id: 'task-original', status: 'completed', result: { images: ['URL:/images/0', 'URL:/images/1'] } });
    mocks.download.mockResolvedValueOnce(blob()).mockRejectedValueOnce(new Error('download failed'));
    const hook = await startGeneration();
    expect(hook.result.current.images).toHaveLength(1);
    expect(hook.result.current.phase).toBe('retrieval-failed');
    mocks.get.mockRejectedValueOnce(Object.assign(new Error('该任务已超出取回时间'), { statusCode: 404 }));
    await act(async () => { await hook.result.current.retryRetrieval(); });
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.error).toContain('已过期');
    expect(hook.result.current.images).toHaveLength(1);
    expect(hook.result.current.messages[0].imageIds).toHaveLength(1);
    expect(mocks.state.pending).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
