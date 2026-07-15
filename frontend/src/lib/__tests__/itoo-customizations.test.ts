import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_TEXT_MODEL_ID,
  ITOO_API_BASE_URL,
} from '@/lib/itoo-config';
import {
  BUILTIN_IMAGE_PRESETS,
  DEFAULT_TEXT_MODEL_TEMPLATES,
  loadRegistry,
  saveRegistry,
  type NovaModelRegistry,
} from '@/lib/nova-models';
import { normalizeModel, resolveAgentModel } from '@/lib/model-capabilities';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(path.resolve(testDir, '../../../../backend/server.js'), 'utf8');
const settingsModalSource = fs.readFileSync(path.resolve(testDir, '../../components/SettingsModal.tsx'), 'utf8');
const layoutSource = fs.readFileSync(path.resolve(testDir, '../../app/layout.tsx'), 'utf8');
const workspaceHeaderSource = fs.readFileSync(path.resolve(testDir, '../../components/workspace/WorkspaceHeader.tsx'), 'utf8');
const workspaceShellSource = fs.readFileSync(path.resolve(testDir, '../../components/workspace/WorkspaceShell.tsx'), 'utf8');
const manifestSource = fs.readFileSync(path.resolve(testDir, '../../../public/manifest.json'), 'utf8');

const tamperedRegistry: NovaModelRegistry = {
  imageModels: [{
    id: 'image-1',
    protocol: 'openai',
    name: 'Image',
    modelId: DEFAULT_IMAGE_MODEL_ID,
    apiKey: 'image-key',
    baseUrl: 'https://untrusted.example',
    builtinPreset: 'gpt-image-2',
    maxRefImages: 16,
    maxOutputSize: '4K',
    supportsAdvancedParams: true,
  }],
  textModels: [{
    id: 'text-1',
    protocol: 'openai-responses',
    name: 'Text',
    modelId: DEFAULT_TEXT_MODEL_ID,
    apiKey: 'text-key',
    baseUrl: 'https://untrusted.example',
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

describe('itoo model defaults', () => {
  beforeEach(() => localStorage.clear());

  it('uses the relay and requested default model ids', () => {
    expect(DEFAULT_IMAGE_MODEL_ID).toBe('gpt-image-2');
    expect(DEFAULT_TEXT_MODEL_ID).toBe('gpt-5.5');
    expect(Object.values(BUILTIN_IMAGE_PRESETS).every((model) => model.baseUrl === ITOO_API_BASE_URL)).toBe(true);
    expect(DEFAULT_TEXT_MODEL_TEMPLATES.every((model) => model.baseUrl === ITOO_API_BASE_URL)).toBe(true);
  });

  it('normalizes tampered registry base urls before use and persistence', () => {
    localStorage.setItem('nova-model-registry', JSON.stringify(tamperedRegistry));
    const loaded = loadRegistry();

    expect(loaded.imageModels[0]?.baseUrl).toBe(ITOO_API_BASE_URL);
    expect(loaded.textModels[0]?.baseUrl).toBe(ITOO_API_BASE_URL);

    saveRegistry(tamperedRegistry);
    const persisted = JSON.parse(localStorage.getItem('nova-model-registry') || '{}') as NovaModelRegistry;
    expect(persisted.imageModels[0]?.baseUrl).toBe(ITOO_API_BASE_URL);
    expect(persisted.textModels[0]?.baseUrl).toBe(ITOO_API_BASE_URL);
  });

  it('uses configured defaults per image task and rejects stale cached models', () => {
    const registry: NovaModelRegistry = {
      ...tamperedRegistry,
      imageModels: [
        tamperedRegistry.imageModels[0],
        { ...tamperedRegistry.imageModels[0], id: 'image-2', name: 'Image Edit' },
      ],
      defaults: {
        ...tamperedRegistry.defaults,
        textToImage: 'image-1',
        imageToImage: 'image-2',
      },
    };
    saveRegistry(registry);

    expect(normalizeModel(undefined, 'textToImage')).toBe('image-1');
    expect(normalizeModel(undefined, 'imageToImage')).toBe('image-2');
    expect(normalizeModel('gemini-3-pro-image-preview', 'textToImage')).toBe('image-1');
  });

  it('does not retain an unavailable Agent image model', () => {
    expect(resolveAgentModel('gemini-3-pro-image-preview', undefined, undefined, [
      { id: 'configured-image', name: 'Configured Image', maxOutputSize: '4K' },
    ])).toBe('configured-image');
  });

  it('has no image-model fallback when no image model is configured', () => {
    expect(normalizeModel(undefined, 'textToImage')).toBe('');
    expect(resolveAgentModel('gemini-3-pro-image-preview', undefined, undefined, [])).toBe('');
  });
});

describe('itoo server upstream policy', () => {
  it('forces task and proxy traffic through the server-side upstream', () => {
    expect(serverSource).toContain("const DEFAULT_NOVA_API_BASE_URL = 'https://api.itoo.me'");
    expect(serverSource).toContain('body.baseUrl = resolveConfiguredUpstreamBaseUrl(body.protocol)');
    expect(serverSource.match(/const normalizedBaseUrl = resolveConfiguredUpstreamBaseUrl\(protocol\);/g)).toHaveLength(2);
    expect(serverSource).not.toContain('normalizeProtocolBaseUrl(protocol, baseUrl)');
  });
});

describe('itoo branding and about content', () => {
  it('uses the iToo Image name across user-visible application surfaces', () => {
    const brandedSources = [
      layoutSource,
      workspaceHeaderSource,
      workspaceShellSource,
      manifestSource,
      serverSource,
    ];

    expect(brandedSources.every(source => source.includes('iToo Image'))).toBe(true);
    expect([...brandedSources, settingsModalSource].every(source => !source.includes('Nova Image'))).toBe(true);
  });

  it('keeps only usage and privacy sections in About without external links', () => {
    expect(settingsModalSource.match(/<details\b/g)).toHaveLength(2);
    expect(settingsModalSource).toContain('使用方法');
    expect(settingsModalSource).toContain('隐私条款');
    expect(settingsModalSource).toContain('中转站创建2个API，一个用于GPT推理，一个是生图专用的API');
    expect(settingsModalSource).not.toContain('数据来源');
    expect(settingsModalSource).not.toContain('参考项目');
    expect(settingsModalSource).not.toMatch(/href=|https?:\/\//);
  });
});
