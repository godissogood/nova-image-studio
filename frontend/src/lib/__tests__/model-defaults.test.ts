import { describe, expect, it } from 'vitest';
import { DEFAULT_DEFAULTS } from '@/lib/nova-models';
import { changeCommonModel, countSeparateDefaults, TEXT_DEFAULT_KEYS } from '@/lib/model-defaults';

const defaults = { ...DEFAULT_DEFAULTS, textToImage: 'image-a', imageToImage: 'image-a', sliceImageEdit: 'image-a', ...Object.fromEntries(TEXT_DEFAULT_KEYS.map(key => [key, 'text-a'])) };

describe('common workflow model choices', () => {
  it('changes all shared text workflows without mutating the original defaults', () => {
    const next = changeCommonModel(defaults, 'text', 'text-b');
    expect(TEXT_DEFAULT_KEYS.map(key => next[key])).toEqual(Array(6).fill('text-b'));
    expect(next.textToImage).toBe('image-a');
    expect(defaults.agent).toBe('text-a');
  });

  it('keeps separately configured text and image workflows', () => {
    const custom = { ...defaults, reversePrompt: 'vision-model', sliceReconstruct: 'coding-model', imageToImage: 'image-editor', sliceImageEdit: 'mask-model' };
    const next = changeCommonModel(changeCommonModel(custom, 'text', 'text-b'), 'image', 'image-b', ['image-a', 'image-b', 'mask-model']);
    expect(next.reversePrompt).toBe('vision-model');
    expect(next.sliceReconstruct).toBe('coding-model');
    expect(next.agent).toBe('text-b');
    expect(next.imageToImage).toBe('image-editor');
    expect(next.sliceImageEdit).toBe('mask-model');
    expect(countSeparateDefaults(next, ['image-b', 'mask-model'])).toBe(4);
  });

  it('only assigns compatible image models to mask editing', () => {
    const openai = changeCommonModel(defaults, 'image', 'image-b', ['image-a', 'image-b']);
    expect([openai.textToImage, openai.imageToImage, openai.sliceImageEdit]).toEqual(Array(3).fill('image-b'));
    const google = changeCommonModel(defaults, 'image', 'gemini', ['image-a']);
    expect(google.imageToImage).toBe('gemini');
    expect(google.sliceImageEdit).toBe('image-a');
    expect(countSeparateDefaults(google, ['image-a'])).toBe(0);
  });

  it('fills empty defaults and leaves the full workflow schema intact', () => {
    const next = changeCommonModel(changeCommonModel(DEFAULT_DEFAULTS, 'text', 'text-a'), 'image', 'image-a', ['image-a']);
    expect(Object.keys(next).sort()).toEqual(Object.keys(DEFAULT_DEFAULTS).sort());
    expect(Object.values(next)).toEqual(expect.arrayContaining(['text-a', 'image-a']));
    expect(Object.values(next).every(Boolean)).toBe(true);
  });
});
