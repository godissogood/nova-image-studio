import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(
  path.resolve(testDir, '../../../../backend/server.js'),
  'utf8',
);

describe('backend GPT Image advanced params forwarding', () => {
  it('does not contain legacy GPT Image SKU gating or token suffix logic', () => {
    expect(serverSource).not.toContain('gpt-image-2-fast');
    expect(serverSource).not.toContain('gpt-image-2-plus');
    expect(serverSource).not.toContain('gpt-image-2-pro');
    expect(serverSource).not.toContain('TOKEN_SUFFIX');
    expect(serverSource).not.toContain('supportsGptImageAdvancedParams(');
  });

  it('forwards supported advanced params but never style in multipart edits', () => {
    expect(serverSource).toContain("formData.append('quality', advancedParams.quality)");
    expect(serverSource).toContain("formData.append('background', advancedParams.background)");
    expect(serverSource).toContain("formData.append('output_format', 'png')");
    expect(serverSource).not.toContain("formData.append('style'");
  });

  it('forwards supported advanced params but never style in JSON generations', () => {
    expect(serverSource).toContain('quality: advancedParams.quality');
    expect(serverSource).toContain('background: advancedParams.background');
    expect(serverSource).toContain("output_format: 'png'");
    expect(serverSource).not.toContain('? { style:');
  });

  it('normalizes style from old OpenAI clients before storing or forwarding tasks', () => {
    expect(serverSource).toContain("if (body.protocol === 'openai')");
    expect(serverSource).toContain('body.gptImageStyle = DEFAULT_GPT_IMAGE_ADVANCED_PARAMS.style');
    expect(serverSource).not.toContain('validateEnumValue(params.gptImageStyle');
  });

  it('routes OpenAI image endpoint by mode rather than legacy model names', () => {
    expect(serverSource).toContain("request.mode === 'image-to-image'");
    expect(serverSource).toContain("/v1/images/edits");
    expect(serverSource).toContain("/v1/images/generations");
  });

  it('resolves and forwards size for OpenAI image requests', () => {
    expect(serverSource).toContain('function resolveGptImageRequestSize(request)');
    expect(serverSource).toContain('const customSize = normalizeCustomImageSize(request.customSize, 4096)');
    expect(serverSource).toContain('return getSupportedGptImageSize(request.model, request.outputSize, request.aspectRatio)');
    expect(serverSource).toContain('return requestGptImage(apiKey, request, resolveGptImageRequestSize(request), { baseUrl });');
  });
});
