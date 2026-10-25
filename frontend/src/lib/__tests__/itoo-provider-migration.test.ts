import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_IMAGE_PRESETS, DEFAULT_DEFAULTS, deriveImageAndTextModels, loadRegistry, saveRegistry, type ImageModelConfig, type NovaModelRegistry } from '@/lib/nova-models';
import { reconcileModelProviders } from '@/lib/provider-registry';

const image = (id: string, key = 'image-key'): ImageModelConfig => ({
  ...BUILTIN_IMAGE_PRESETS['gpt-image-2.5'], id, builtinPreset: 'gpt-image-2.5', apiKey: key, name: id,
});
function legacy(): NovaModelRegistry {
  return {
    imageModels: [image('img-a'), image('img-b'), image('img-c', 'another-image-key')],
    textModels: [{ id: 'txt-a', name: '推理', modelId: 'gpt-5.5', apiKey: 'text-key', protocol: 'openai-responses', baseUrl: 'https://untrusted.test', builtinTemplate: 'gpt-5.5', note: '保留备注' }],
    defaults: { ...DEFAULT_DEFAULTS, textToImage: 'img-b', imageToImage: 'img-c', agent: 'txt-a' },
  };
}
beforeEach(() => localStorage.clear());
describe('iToo provider migration and model editor compatibility', () => {
  it('keeps duplicate model IDs, separate keys, defaults, templates and custom preset metadata on round trip', () => {
    localStorage.setItem('nova-model-registry', JSON.stringify(legacy()));
    const first = loadRegistry();
    saveRegistry(first);
    const second = loadRegistry();
    expect(second.imageModels.map(model => [model.id, model.apiKey, model.builtinPreset])).toEqual([
      ['img-a', 'image-key', 'gpt-image-2.5'], ['img-b', 'image-key', 'gpt-image-2.5'], ['img-c', 'another-image-key', 'gpt-image-2.5'],
    ]);
    expect(second.textModels[0]).toMatchObject({ id: 'txt-a', apiKey: 'text-key', builtinTemplate: 'gpt-5.5', note: '保留备注' });
    expect(second.defaults).toMatchObject({ textToImage: 'img-b', imageToImage: 'img-c', agent: 'txt-a' });
    expect(second.providers?.every(provider => provider.baseUrl === 'https://api.itoo.me')).toBe(true);
  });

  it('persists custom and API-loaded model ID modes independently for image and text models', () => {
    const registry = legacy();
    registry.imageModels[0] = { ...registry.imageModels[0], modelId: 'image-from-list', customModelId: 'manual-image-id', useCustomModelId: false };
    registry.textModels[0] = { ...registry.textModels[0], modelId: 'gpt-6.1-sol', customModelId: 'manual-text-id', useCustomModelId: true };

    saveRegistry(registry);

    const saved = loadRegistry();
    expect(saved.imageModels[0]).toMatchObject({ modelId: 'image-from-list', customModelId: 'manual-image-id', useCustomModelId: false });
    expect(saved.textModels[0]).toMatchObject({ modelId: 'gpt-6.1-sol', customModelId: 'manual-text-id', useCustomModelId: true });
  });

  it('preserves provider identities and disabled/video/audio rows when an individual model changes key or is deleted', () => {
    saveRegistry(legacy());
    const registry = loadRegistry();
    const providers = registry.providers!;
    providers[0].models.push({ id: 'video-row', modelId: 'grok-imagine-video', name: '视频', uses: ['video'] },
      { id: 'audio-row', modelId: 'tts', name: '语音', uses: ['audio'] },
      { id: 'unused-row', modelId: 'unused', name: '未启用', uses: [] });
    const edited = registry.imageModels.filter(model => model.id !== 'img-b').map(model => model.id === 'img-a' ? { ...model, apiKey: 'changed-key' } : model);
    const next = reconcileModelProviders(providers, edited, registry.textModels);
    saveRegistry({ ...registry, providers: next, imageModels: edited });
    const saved = loadRegistry();
    expect(saved.providers?.find(provider => provider.id === providers[0].id)?.models.map(entry => entry.id)).toEqual(['video-row', 'audio-row', 'unused-row']);
    expect(saved.imageModels.map(model => model.id)).toEqual(expect.arrayContaining(['img-a', 'img-c']));
    expect(saved.imageModels.find(model => model.id === 'img-a')?.apiKey).toBe('changed-key');
    expect(saved.textModels[0].apiKey).toBe('text-key');
    expect(saved.imageModels.some(model => model.id === 'img-b')).toBe(false);
  });

  it('retains provider purpose selections before a key is supplied and gives duplicate manual rows distinct config IDs', () => {
    const providers = [{ id: 'provider', name: '测试', apiKey: '', baseUrl: 'https://untrusted.test', kind: 'openai-compatible' as const, models: [
      { id: 'one', name: '甲', modelId: 'gpt-image-2', uses: ['image' as const] },
      { id: 'two', name: '乙', modelId: 'gpt-image-2', uses: ['image' as const] },
    ] }];
    const derived = deriveImageAndTextModels(providers);
    expect(new Set(derived.imageModels.map(model => model.id)).size).toBe(2);
    const next = reconcileModelProviders(providers, derived.imageModels, []);
    expect(next[0].models.map(entry => entry.uses)).toEqual([['image'], ['image']]);
    saveRegistry({ ...derived, providers: next, defaults: DEFAULT_DEFAULTS });
    expect(loadRegistry().imageModels).toHaveLength(2);
  });
});
