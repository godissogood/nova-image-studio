import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useApiKeyStatus } from '@/hooks/useApiKeyStatus';
import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

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

  it('hydrates saved configuration from the same empty server snapshot without rebuilding the page', async () => {
    localStorage.setItem('nova-model-registry', JSON.stringify(completeRegistry));
    function Status() {
      const [configured] = useApiKeyStatus();
      return createElement('span', null, configured ? 'configured' : 'empty');
    }
    const container = document.createElement('div');
    container.innerHTML = renderToString(createElement(Status));
    expect(container.textContent).toBe('empty');
    document.body.append(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, createElement(Status), { onRecoverableError: error => errors.push(error) });
    });
    expect(container.textContent).toBe('configured');
    expect(errors).toEqual([]);
    act(() => root.unmount());
    container.remove();
  });

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
