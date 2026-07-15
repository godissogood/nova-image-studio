import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useApiKeyStatus } from '@/hooks/useApiKeyStatus';

const completeRegistry = {
  imageModels: [{
    id: 'image-1',
    protocol: 'openai',
    name: 'GPT Image 2',
    modelId: 'gpt-image-2',
    apiKey: 'image-key',
    baseUrl: 'https://api.itoo.me',
    builtinPreset: 'gpt-image-2',
    maxRefImages: 16,
    maxOutputSize: '4K',
    supportsAdvancedParams: true,
  }],
  textModels: [{
    id: 'text-1',
    protocol: 'openai-responses',
    name: 'GPT 5.5',
    modelId: 'gpt-5.5',
    apiKey: 'text-key',
    baseUrl: 'https://api.itoo.me',
  }],
  defaults: {
    textToImage: 'image-1',
    imageToImage: 'image-1',
    reversePrompt: 'text-1',
    agent: 'text-1',
    promptOptimize: 'text-1',
    imageDescribe: 'text-1',
  },
};

describe('useApiKeyStatus', () => {
  beforeEach(() => localStorage.clear());

  it('updates immediately when settings are saved in the same tab', () => {
    const { result } = renderHook(() => useApiKeyStatus());
    expect(result.current[0]).toBe(false);

    localStorage.setItem('nova-model-registry', JSON.stringify(completeRegistry));
    act(() => window.dispatchEvent(new Event('nova-model-registry-updated')));

    expect(result.current[0]).toBe(true);
  });

  it('updates when another tab changes the model registry', () => {
    localStorage.setItem('nova-model-registry', JSON.stringify(completeRegistry));
    const { result } = renderHook(() => useApiKeyStatus());
    expect(result.current[0]).toBe(true);

    localStorage.removeItem('nova-model-registry');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'nova-model-registry' })));

    expect(result.current[0]).toBe(false);
  });
});
