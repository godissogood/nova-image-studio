import type { DefaultModels } from '@/lib/nova-models';

export const TEXT_DEFAULT_KEYS = ['agent', 'reversePrompt', 'promptOptimize', 'imageDescribe', 'sliceDecomposition', 'sliceReconstruct'] as const;

/** Change shared choices while preserving workflows already configured separately. */
export function changeCommonModel(defaults: DefaultModels, kind: 'image' | 'text', id: string, sliceCapableIds: string[] = []): DefaultModels {
  const next = { ...defaults };
  if (kind === 'text') {
    for (const key of TEXT_DEFAULT_KEYS) {
      if (!defaults[key] || defaults[key] === defaults.agent) next[key] = id;
    }
    next.agent = id;
  } else {
    next.textToImage = id;
    if (!defaults.imageToImage || defaults.imageToImage === defaults.textToImage) next.imageToImage = id;
    if (sliceCapableIds.includes(id) && (!defaults.sliceImageEdit || defaults.sliceImageEdit === defaults.textToImage)) next.sliceImageEdit = id;
  }
  return next;
}

export function countSeparateDefaults(defaults: DefaultModels, sliceCapableIds: string[]): number {
  const text = TEXT_DEFAULT_KEYS.filter(key => defaults[key] && defaults[key] !== defaults.agent).length;
  const image = defaults.imageToImage && defaults.imageToImage !== defaults.textToImage ? 1 : 0;
  // An incompatible common image model necessarily needs a separate mask-edit model.
  const slice = sliceCapableIds.includes(defaults.textToImage) && defaults.sliceImageEdit && defaults.sliceImageEdit !== defaults.textToImage ? 1 : 0;
  return text + image + slice;
}
