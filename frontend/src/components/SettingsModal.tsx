'use client';

import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  ImageIcon,
  Info,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommonModelSettings } from '@/components/settings/CommonModelSettings';
import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import { WorkflowModelSettings } from '@/components/settings/WorkflowModelSettings';
import { reconcileModelProviders } from '@/lib/provider-registry';
import { PluginsSettings } from '@/components/settings/PluginsSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BackupProgress } from '@/components/BackupProgress';
import { Toast, type ToastData } from '@/components/workspace/Toast';
import {
  BUILTIN_IMAGE_PRESETS,
  BUILTIN_IMAGE_PRESET_OPTIONS,
  BUILTIN_TEXT_PRESETS,
  BUILTIN_TEXT_PRESET_OPTIONS,
  generateModelId,
  getDefaultTextModelTemplate,
  getTextModelTemplate,
  getImageModelOutputSizes,
  isSliceCapableImageModel,
  loadRegistry,
  saveRegistry,
  type DefaultModels,
  type ImageModelConfig,
  type ProviderProtocol,
  type TextModelConfig,
  type BuiltinTextPresetId,
  type BuiltinTextPreset,
} from '@/lib/nova-models';
import {
  getTextProviderLabel,
  type TextProviderProtocol,
} from '@/lib/nova-text-protocol';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { exportAllData, importAllData, downloadBlob, generateBackupFilename, type BackupProgress as BackupProgressType } from '@/lib/backup-utils';
import { checkModelsAvailability, type ModelStatus } from '@/lib/ccode-task-client';
import { hasAnyApiKey } from '@/lib/settings-storage';
import { fetchModelIds } from '@/lib/model-id-client';

/** 设置弹层的页签。调用方可以指定打开时落在哪一页。 */
export type SettingsTab = 'models' | 'plugins' | 'backup' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange?: (hasKey: boolean) => void;
  /** 打开时默认停在哪一页，缺省「模型配置」 */
  initialTab?: SettingsTab;
}

function cloneImageModel(model: ImageModelConfig): ImageModelConfig {
  return { ...model };
}

function cloneTextModel(model: TextModelConfig): TextModelConfig {
  return { ...model };
}

function nextConfigName(prefix: '图片模型' | '文本模型', models: readonly { name: string }[]): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const highest = models.reduce((max, model) => {
    const match = model.name.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${highest + 1}`;
}

function createImageModelDraft(name: string, apiKey = ''): ImageModelConfig {
  const preset = BUILTIN_IMAGE_PRESETS['gpt-image-2'];
  return {
    id: generateModelId('img'),
    protocol: preset.protocol,
    name,
    modelId: preset.modelId,
    customModelId: preset.modelId,
    useCustomModelId: true,
    apiKey,
    baseUrl: preset.baseUrl,
    builtinPreset: preset.id,
    maxRefImages: preset.maxRefImages,
    maxOutputSize: preset.maxOutputSize,
    supportsAdvancedParams: preset.supportsAdvancedParams,
  };
}

function createTextModelDraft(name: string, apiKey = ''): TextModelConfig {
  const template = getTextModelTemplate('gpt-6.1-sol');
  return {
    id: generateModelId('txt'),
    protocol: template.protocol,
    name,
    modelId: template.modelId,
    customModelId: template.modelId,
    useCustomModelId: true,
    apiKey,
    baseUrl: template.baseUrl,
    note: template.note,
    builtinTemplate: template.id,
  };
}

function isCompleteImageModel(model: ImageModelConfig): boolean {
  return Boolean(model.name.trim() && model.modelId.trim() && model.apiKey.trim() && model.baseUrl.trim());
}

function isCompleteTextModel(model: TextModelConfig): boolean {
  return Boolean(model.name.trim() && model.modelId.trim() && model.apiKey.trim() && model.baseUrl.trim());
}

const IMAGE_PROVIDER_META: Record<ProviderProtocol, { label: string; className: string }> = {
  google: { label: 'Google', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
  openai: { label: 'OpenAI', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
  grok: { label: 'Grok', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' },
  doubao: { label: '豆包', className: 'border-sky-200 text-sky-700 dark:text-sky-300' },
  'alibaba-dashscope': { label: '阿里百炼', className: 'border-orange-200 text-orange-700 dark:text-orange-300' },
};

const TEXT_PROVIDER_META: Record<BuiltinTextPreset['provider'], { label: string; className: string }> = {
  gpt: { label: 'GPT', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
  grok: { label: 'Grok', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' },
  google: { label: 'Google', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300' },
  anthropic: { label: 'Claude', className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300' },
  compatible: { label: '兼容', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
};

function TextProviderBadge({ provider }: { provider: BuiltinTextPreset['provider'] }) {
  const meta = TEXT_PROVIDER_META[provider];
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-semibold leading-none ${meta.className}`}>{meta.label}</span>;
}

function ImageProviderBadge({ protocol }: { protocol: ProviderProtocol }) {
  const meta = IMAGE_PROVIDER_META[protocol];
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-semibold leading-none ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function textProviderForProtocol(protocol: TextProviderProtocol): BuiltinTextPreset['provider'] {
  if (protocol === 'google-gemini') return 'google';
  if (protocol === 'anthropic-messages') return 'anthropic';
  return 'gpt';
}

function getModelListProtocol(protocol: ProviderProtocol | TextProviderProtocol): string {
  if (protocol === 'google' || protocol === 'google-gemini') return 'google-gemini';
  if (protocol === 'anthropic-messages') return 'anthropic-messages';
  return 'openai';
}

interface ModelIdModeFieldProps {
  kindLabel: '图片模型' | '文本模型';
  modelId: string;
  customModelId: string;
  useCustomModelId: boolean;
  onModeChange: (useCustomModelId: boolean) => void;
  onCustomModelIdChange: (value: string) => void;
}

function ModelIdModeField({ kindLabel, modelId, customModelId, useCustomModelId, onModeChange, onCustomModelIdChange }: ModelIdModeFieldProps) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-foreground">
          <span>模型 ID 自定义</span><span className="text-xs font-normal text-muted-foreground">要调用的模型</span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <Switch aria-label={`${kindLabel}自定义模型 ID`} checked={useCustomModelId} onCheckedChange={onModeChange} />
        </div>
      </div>
      <Input className="h-11" aria-label={`${kindLabel}自定义模型 ID`} value={useCustomModelId ? customModelId : modelId} disabled={!useCustomModelId}
        onChange={(event) => onCustomModelIdChange(event.target.value)} />
    </div>
  );
}

interface ModelIdLoadFieldProps {
  kindLabel: '图片模型' | '文本模型';
  modelId: string;
  modelIds: string[];
  apiKey: string;
  useCustomModelId: boolean;
  loading: boolean;
  error?: string;
  onModeChange: (useCustomModelId: boolean) => void;
  onModelIdChange: (value: string) => void;
  onLoad: () => void;
}

function ModelIdLoadField({ kindLabel, modelId, modelIds, apiKey, useCustomModelId, loading, error, onModeChange, onModelIdChange, onLoad }: ModelIdLoadFieldProps) {
  const options = modelIds.map(id => ({ value: id, label: id }));
  if (!useCustomModelId && modelId && !modelIds.includes(modelId)) {
    options.unshift({ value: modelId, label: `${modelId}（当前配置）` });
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-foreground">
          <span>模型 ID 加载</span><span className="text-xs font-normal text-muted-foreground">填写 API 后载入模型并选择</span>
        </label>
        <Switch aria-label={`${kindLabel}从 API 载入模型 ID`} checked={!useCustomModelId} onCheckedChange={(enabled) => onModeChange(!enabled)} />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Select ariaLabel={`${kindLabel}载入的模型 ID`} className="h-11 min-w-0 flex-1 bg-background" value={useCustomModelId ? '' : modelId}
          options={options} disabled={useCustomModelId || !apiKey.trim() || modelIds.length === 0} placeholder={modelIds.length ? '请选择 API 模型' : '先载入 API 模型'} onValueChange={onModelIdChange} />
        <Button aria-label={`${kindLabel}载入模型列表`} variant="secondary" className="h-11 shrink-0 gap-2 px-3" disabled={useCustomModelId || !apiKey.trim() || loading} onClick={onLoad}>
          <RefreshCw className={`size-4 ${loading ? 'motion-safe:animate-spin' : ''}`} />{loading ? '载入中' : '载入'}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p>}
      {!error && modelIds.length > 0 && <p role="status" className="text-xs text-muted-foreground">已载入 {modelIds.length} 个模型</p>}
    </div>
  );
}

function imageModelOptionLabel(model: Pick<ImageModelConfig, 'name' | 'protocol'>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ImageProviderBadge protocol={model.protocol} />
      <span className="truncate">{model.name}</span>
    </span>
  );
}

function getImageModelLabel(models: ImageModelConfig[], id: string): string | undefined {
  return models.find((model) => model.id === id)?.name;
}

function getTextModelLabel(models: TextModelConfig[], id: string): string | undefined {
  return models.find((model) => model.id === id)?.name;
}

function normalizeDefaults(
  defaults: DefaultModels,
  imageModels: ImageModelConfig[],
  textModels: TextModelConfig[],
): DefaultModels {
  const completeImageModels = imageModels.filter(isCompleteImageModel);
  const completeTextModels = textModels.filter(isCompleteTextModel);
  const sliceCapableImageModels = completeImageModels.filter(isSliceCapableImageModel);
  const firstImageModelId = completeImageModels[0]?.id || '';
  const firstTextModelId = completeTextModels[0]?.id || '';

  return {
    textToImage: completeImageModels.some((model) => model.id === defaults.textToImage) ? defaults.textToImage : firstImageModelId,
    imageToImage: completeImageModels.some((model) => model.id === defaults.imageToImage) ? defaults.imageToImage : firstImageModelId,
    reversePrompt: completeTextModels.some((model) => model.id === defaults.reversePrompt) ? defaults.reversePrompt : firstTextModelId,
    agent: completeTextModels.some((model) => model.id === defaults.agent) ? defaults.agent : firstTextModelId,
    promptOptimize: completeTextModels.some((model) => model.id === defaults.promptOptimize) ? defaults.promptOptimize : firstTextModelId,
    imageDescribe: completeTextModels.some((model) => model.id === defaults.imageDescribe) ? defaults.imageDescribe : firstTextModelId,
    sliceDecomposition: completeTextModels.some((model) => model.id === defaults.sliceDecomposition) ? defaults.sliceDecomposition : firstTextModelId,
    sliceReconstruct: completeTextModels.some((model) => model.id === defaults.sliceReconstruct) ? defaults.sliceReconstruct : firstTextModelId,
    // 切图的图片编辑只能落在 openai 协议模型上；没有这类模型时留空并在切图页提示
    sliceImageEdit: sliceCapableImageModels.some((model) => model.id === defaults.sliceImageEdit)
      ? defaults.sliceImageEdit
      : (sliceCapableImageModels[0]?.id || ''),
  };
}

export function SettingsModal({ isOpen, onClose, onApiKeyChange, initialTab = 'models' }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  // 每次打开都回到调用方指定的那一页：从「插件凭据未配置」的提示条点进来要直达插件页。
  // 用「渲染期按 prop 变化调整 state」而不是 effect，避免先渲染出模型页再跳一帧。
  const [wasOpen, setWasOpen] = useState(false);
  const [initialRegistry] = useState(() => loadRegistry());
  const [imageModels, setImageModels] = useState<ImageModelConfig[]>(() => initialRegistry.imageModels.map(cloneImageModel));
  const [textModels, setTextModels] = useState<TextModelConfig[]>(() => initialRegistry.textModels.map(cloneTextModel));
  const [providers, setProviders] = useState(() => initialRegistry.providers || []);
  const [savedDraft, setSavedDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [defaultsDraft, setDefaults] = useState<DefaultModels>(() => normalizeDefaults(
    initialRegistry.defaults,
    initialRegistry.imageModels,
    initialRegistry.textModels,
  ));
  const [selectedImageModelId, setSelectedImageModelId] = useState('');
  const [selectedTextModelId, setSelectedTextModelId] = useState('');
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastIdRef = useRef(0);
  const [checkingModels, setCheckingModels] = useState(false);
  const [savingAndCheckingModelId, setSavingAndCheckingModelId] = useState('');
  const [modelConnectionResults, setModelConnectionResults] = useState<Record<string, { available: boolean; message: string }>>({});
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[] | null>(null);
  const [modelCheckError, setModelCheckError] = useState<string | null>(null);
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [showTextApiKey, setShowTextApiKey] = useState(false);
  const modelEditorsRef = useRef<HTMLDivElement>(null);
  const [loadedModelIds, setLoadedModelIds] = useState<Record<string, string[]>>({});
  const [modelLoadErrors, setModelLoadErrors] = useState<Record<string, string>>({});
  const [loadingModelListKey, setLoadingModelListKey] = useState('');
  const modelListRequestRef = useRef<{ key: string; controller: AbortController } | null>(null);

  const [backupProgress, setBackupProgress] = useState<BackupProgressType>({ percent: 0, message: '' });
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: ToastData['type']) => {
    setToast({ id: `settings-toast-${++toastIdRef.current}`, message, type });
  };
  const dismissToast = (id: string) => {
    setToast(current => current?.id === id ? null : current);
  };

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      modelListRequestRef.current?.controller.abort();
      modelListRequestRef.current = null;
      const registry = loadRegistry();
      setTab(initialTab);
      setImageModels(registry.imageModels.map(cloneImageModel));
      setTextModels(registry.textModels.map(cloneTextModel));
      setProviders(registry.providers || []);
      setSavedDraft(JSON.stringify({ imageModels: registry.imageModels, textModels: registry.textModels, providers: registry.providers || [], defaults: normalizeDefaults(registry.defaults, registry.imageModels, registry.textModels) }));
      setConfirmDiscard(false);
      setDefaults(normalizeDefaults(registry.defaults, registry.imageModels, registry.textModels));
      setSelectedImageModelId(registry.imageModels[0]?.id || '');
      setSelectedTextModelId(registry.textModels[0]?.id || '');
      setToast(null);
      setModelStatuses(null);
      setModelCheckError(null);
      setSavingAndCheckingModelId('');
      setModelConnectionResults({});
      setLoadedModelIds({});
      setModelLoadErrors({});
      setLoadingModelListKey('');
      setBackupError(null);
      setBackupSuccess(null);
    }
  }

  const defaults = normalizeDefaults(defaultsDraft, imageModels, textModels);

  const draftSnapshot = JSON.stringify({ imageModels, textModels, providers, defaults });
  const isDirty = savedDraft !== draftSnapshot;
  const mergedProviders = useMemo(() => reconcileModelProviders(providers, imageModels, textModels), [providers, imageModels, textModels]);
  const modelListKey = (kind: 'image' | 'text', id: string) => `${kind}:${id}`;
  const clearModelList = (kind: 'image' | 'text', id: string) => {
    const key = modelListKey(kind, id);
    if (modelListRequestRef.current?.key === key) {
      modelListRequestRef.current.controller.abort();
      modelListRequestRef.current = null;
      setLoadingModelListKey('');
    }
    setLoadedModelIds(prev => { const next = { ...prev }; delete next[key]; return next; });
    setModelLoadErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };
  const loadModelList = async (kind: 'image' | 'text', id: string, apiKey: string, protocol: ProviderProtocol | TextProviderProtocol) => {
    const key = modelListKey(kind, id);
    if (!apiKey.trim()) {
      setModelLoadErrors(prev => ({ ...prev, [key]: '请先填写 API Key。' }));
      return;
    }
    modelListRequestRef.current?.controller.abort();
    const controller = new AbortController();
    modelListRequestRef.current = { key, controller };
    setLoadingModelListKey(key);
    setModelLoadErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    try {
      const ids = await fetchModelIds({ apiKey: apiKey.trim(), protocol: getModelListProtocol(protocol), signal: controller.signal });
      if (controller.signal.aborted) return;
      setLoadedModelIds(prev => ({ ...prev, [key]: ids }));
      if (ids.length === 0) setModelLoadErrors(prev => ({ ...prev, [key]: '此 API Key 没有返回可选择的模型。' }));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setModelLoadErrors(prev => ({ ...prev, [key]: cause instanceof Error ? cause.message : '载入模型失败，请重试。' }));
      }
    } finally {
      if (modelListRequestRef.current?.controller === controller) {
        modelListRequestRef.current = null;
        setLoadingModelListKey('');
      }
    }
  };
  const saveDraft = () => {
    const incompleteImage = imageModels.find(model => !isCompleteImageModel(model));
    const incompleteText = textModels.find(model => !isCompleteTextModel(model));
    if (incompleteImage || incompleteText) {
      showToast('请补全模型的配置备注、模型 ID 和 API Key 后再保存。', 'error');
      if (incompleteImage) setSelectedImageModelId(incompleteImage.id);
      if (incompleteText) setSelectedTextModelId(incompleteText.id);
      requestAnimationFrame(() => modelEditorsRef.current?.scrollIntoView({ block: 'start' }));
      return;
    }
    try {
      saveRegistry({ providers: mergedProviders, imageModels, textModels, defaults });
      setSavedDraft(draftSnapshot);
      syncDynamicModelExports();
      onApiKeyChange?.(hasAnyApiKey());
      showToast('配置已保存', 'success');
    } catch {
      showToast('保存配置失败，请检查浏览器存储空间后重试。', 'error');
    }
  };

  const handleSaveAndCheckModel = async (kind: 'image' | 'text', model: ImageModelConfig | TextModelConfig) => {
    const complete = kind === 'image'
      ? isCompleteImageModel(model as ImageModelConfig)
      : isCompleteTextModel(model as TextModelConfig);
    if (!complete) {
      setModelConnectionResults(prev => ({
        ...prev,
        [model.id]: { available: false, message: '请先填写配置备注、API Key 和有效的模型 ID。' },
      }));
      return;
    }

    setSavingAndCheckingModelId(model.id);
    setModelConnectionResults(prev => {
      const next = { ...prev };
      delete next[model.id];
      return next;
    });
    try {
      saveRegistry({ providers: mergedProviders, imageModels, textModels, defaults });
      setSavedDraft(draftSnapshot);
      syncDynamicModelExports();
      onApiKeyChange?.(hasAnyApiKey());

      const [status] = await checkModelsAvailability([model.id]);
      const available = Boolean(status?.available);
      const message = available
        ? '连接成功，API Key 与模型 ID 均可用。'
        : '当前模型配置连接失败，请检测api、模型id是否匹配';
      setModelConnectionResults(prev => ({
        ...prev,
        [model.id]: { available, message },
      }));
      showToast(message, available ? 'success' : 'error');
    } catch {
      const message = '当前模型配置连接失败，请检测api、模型id是否匹配';
      setModelConnectionResults(prev => ({
        ...prev,
        [model.id]: { available: false, message },
      }));
      showToast(message, 'error');
    } finally {
      setSavingAndCheckingModelId('');
    }
  };

  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId) || null,
    [imageModels, selectedImageModelId],
  );
  const selectedTextModel = useMemo(
    () => textModels.find((model) => model.id === selectedTextModelId) || null,
    [selectedTextModelId, textModels],
  );

  const handleAddImageModel = () => {
    const draft = createImageModelDraft(nextConfigName('图片模型', imageModels), mergedProviders[0]?.apiKey);
    setImageModels((prev) => [...prev, draft]);
    setSelectedImageModelId(draft.id);
  };

  const handleUpdateImageModel = (id: string, patch: Partial<ImageModelConfig>) => {
    setModelConnectionResults(prev => { const next = { ...prev }; delete next[id]; return next; });
    const current = imageModels.find((model) => model.id === id);
    const preset = patch.builtinPreset ? BUILTIN_IMAGE_PRESETS[patch.builtinPreset] : undefined;
    const nextProtocol = preset?.protocol ?? patch.protocol;
    if (current && ((patch.apiKey !== undefined && patch.apiKey !== current.apiKey)
      || (nextProtocol !== undefined && nextProtocol !== current.protocol))) {
      clearModelList('image', id);
    }
    setImageModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      const next = { ...model, ...patch };
      if (patch.builtinPreset) {
        const preset = BUILTIN_IMAGE_PRESETS[patch.builtinPreset];
        next.protocol = preset.protocol;
        if (next.useCustomModelId !== false) {
          next.modelId = preset.modelId;
          next.customModelId = preset.modelId;
        } else if (preset.protocol !== model.protocol) {
          next.modelId = '';
        }
        next.baseUrl = preset.baseUrl;
        next.maxRefImages = preset.maxRefImages;
        next.maxOutputSize = preset.maxOutputSize;
        next.supportsAdvancedParams = preset.supportsAdvancedParams;
      }
      if (patch.protocol === 'google' || patch.protocol === 'grok') {
        next.supportsAdvancedParams = false;
      }
      return next;
    }));
  };

  const handleImageModelModeChange = (model: ImageModelConfig, useCustomModelId: boolean) => {
    handleUpdateImageModel(model.id, useCustomModelId
      ? { useCustomModelId: true, modelId: model.customModelId ?? model.modelId }
      : { useCustomModelId: false, customModelId: model.useCustomModelId === false ? model.customModelId : model.modelId, modelId: '' });
  };

  const handleDeleteImageModel = (id: string) => {
    const nextModels = imageModels.filter((model) => model.id !== id);
    setImageModels(nextModels);
    setDefaults((prev) => ({
      ...prev,
      textToImage: prev.textToImage === id ? '' : prev.textToImage,
      imageToImage: prev.imageToImage === id ? '' : prev.imageToImage,
    }));
    if (selectedImageModelId === id) {
      setSelectedImageModelId(nextModels[0]?.id || '');
    }
  };

  const handleAddTextModel = () => {
    const draft = createTextModelDraft(nextConfigName('文本模型', textModels), mergedProviders[0]?.apiKey);
    setTextModels((prev) => [...prev, draft]);
    setSelectedTextModelId(draft.id);
  };

  const handleUpdateTextModel = (id: string, patch: Partial<TextModelConfig>) => {
    setModelConnectionResults(prev => { const next = { ...prev }; delete next[id]; return next; });
    const current = textModels.find((model) => model.id === id);
    if (current && ((patch.apiKey !== undefined && patch.apiKey !== current.apiKey)
      || (patch.protocol !== undefined && patch.protocol !== current.protocol))) {
      clearModelList('text', id);
    }
    setTextModels((prev) => prev.map((model) => (model.id === id ? { ...model, ...patch } : model)));
  };

  const handleApplyTextTemplate = (id: string, templateId: BuiltinTextPresetId) => {
    const model = textModels.find((item) => item.id === id);
    const template = BUILTIN_TEXT_PRESETS[templateId];
    if (!model || !template) return;
    const protocolChanged = model.protocol !== template.protocol;
    handleUpdateTextModel(id, {
      protocol: template.protocol,
      builtinTemplate: template.id,
      note: template.note,
      ...(model.useCustomModelId === false
        ? { modelId: protocolChanged ? '' : model.modelId }
        : { modelId: template.modelId, customModelId: template.modelId }),
    });
  };

  const handleTextModelModeChange = (model: TextModelConfig, useCustomModelId: boolean) => {
    handleUpdateTextModel(model.id, useCustomModelId
      ? { useCustomModelId: true, modelId: model.customModelId ?? model.modelId }
      : { useCustomModelId: false, customModelId: model.useCustomModelId === false ? model.customModelId : model.modelId, modelId: '' });
  };

  const handleDeleteTextModel = (id: string) => {
    const nextModels = textModels.filter((model) => model.id !== id);
    setTextModels(nextModels);
    setDefaults((prev) => ({
      ...prev,
      reversePrompt: prev.reversePrompt === id ? '' : prev.reversePrompt,
      agent: prev.agent === id ? '' : prev.agent,
      promptOptimize: prev.promptOptimize === id ? '' : prev.promptOptimize,
      imageDescribe: prev.imageDescribe === id ? '' : prev.imageDescribe,
      sliceDecomposition: prev.sliceDecomposition === id ? '' : prev.sliceDecomposition,
      sliceReconstruct: prev.sliceReconstruct === id ? '' : prev.sliceReconstruct,
    }));
    if (selectedTextModelId === id) {
      setSelectedTextModelId(nextModels[0]?.id || '');
    }
  };

  const handleCheckModels = async () => {
    const configuredModels = [
      ...imageModels.filter(isCompleteImageModel),
      ...textModels.filter(isCompleteTextModel),
    ];
    if (configuredModels.length === 0) {
      setModelCheckError('请先完成至少一个图片模型或文本模型配置');
      return;
    }

    setCheckingModels(true);
    setModelCheckError(null);
    setModelStatuses(null);
    try {
      const statuses = await checkModelsAvailability(configuredModels.map((model) => model.id));
      setModelStatuses(statuses);
    } catch (err) {
      setModelCheckError(err instanceof Error ? err.message : '检查模型失败');
    } finally {
      setCheckingModels(false);
    }
  };

  const handleExport = async (configOnly = false) => {
    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const blob = await exportAllData((progress) => setBackupProgress(progress), { includeImages: !configOnly });
      const filename = generateBackupFilename(configOnly);
      downloadBlob(blob, filename);
      setBackupSuccess(`数据已成功导出为 ${filename}`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsBackupActive(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setBackupError('请选择有效的备份文件（.zip 格式）');
      return;
    }

    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const warnings = await importAllData(file, (progress) => setBackupProgress(progress));

      setBackupSuccess(warnings.length > 0
        ? `数据已导入，但有 ${warnings.length} 项提示：${warnings.join('；')}。页面将在 2 秒后刷新...`
        : '数据已成功导入！页面将在 2 秒后刷新以应用更改...');

      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导入失败');
      setIsBackupActive(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleImport(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const builtinImagePresetOptions = BUILTIN_IMAGE_PRESET_OPTIONS.map((option) => {
    const preset = BUILTIN_IMAGE_PRESETS[option.value];
    return { ...option, label: imageModelOptionLabel({ name: option.label, protocol: preset.protocol }) };
  });
  const completeImageOptions = imageModels.filter(isCompleteImageModel).map((model) => ({ value: model.id, label: imageModelOptionLabel(model) }));
  const completeTextOptions = textModels.filter(isCompleteTextModel).map((model) => ({
    value: model.id,
    label: model.builtinTemplate && BUILTIN_TEXT_PRESETS[model.builtinTemplate]
      ? <span className="flex min-w-0 items-center gap-2"><TextProviderBadge provider={BUILTIN_TEXT_PRESETS[model.builtinTemplate].provider} /><span className="truncate">{model.name}</span></span>
      : model.name,
  }));
  // 切图的图片编辑只能落在 openai 协议模型上（带 mask 的 /v1/images/edits）
  const sliceCapableImageOptions = imageModels
    .filter((model) => isCompleteImageModel(model) && isSliceCapableImageModel(model))
    .map((model) => ({ value: model.id, label: imageModelOptionLabel(model) }));
  const selectedImageOutputSizes = selectedImageModel
    ? getImageModelOutputSizes({
        ...selectedImageModel,
        maxOutputSize: BUILTIN_IMAGE_PRESETS[selectedImageModel.builtinPreset].maxOutputSize,
      })
    : ['1K'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && isBackupActive) return;
      if (!open) {
        if (savedDraft !== draftSnapshot) setConfirmDiscard(true);
        else onClose();
      }
    }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 pt-0 gap-0 sm:max-w-5xl">
        <DialogHeader className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <DialogTitle>设置</DialogTitle>
          </div>
          <DialogDescription>分别配置图片模型和文本推理模型，并设置常用默认模型。</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={value => setTab(value as SettingsTab)} className="min-h-0 min-w-0 flex-1 gap-0">
          <TabsList className="min-h-11 w-full shrink-0 justify-start overflow-x-auto overflow-y-hidden rounded-none border-b bg-transparent h-auto p-0 [&>[data-slot=tabs-trigger]]:flex-none sm:[&>[data-slot=tabs-trigger]]:flex-1">
            <TabsTrigger value="models" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <ImageIcon className="w-4 h-4" />
              模型配置
            </TabsTrigger>
            <TabsTrigger value="plugins" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <Package className="w-4 h-4" />
              插件
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <Database className="w-4 h-4" />
              备份
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <Info className="w-4 h-4" />
              关于
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="min-h-0 overflow-y-auto p-4 sm:p-6 mt-0 space-y-4">

            <div ref={modelEditorsRef} className="min-w-0 scroll-mt-4 space-y-4">
              <div className="min-w-0 space-y-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-4 sm:p-5">
                  <SettingsSectionHeading
                    title="图片模型配置"
                    description="管理用于生成和编辑图片的模型。"
                    action={<Button variant="outline" className="min-h-11 gap-2" onClick={handleAddImageModel}>
                      <Plus className="w-4 h-4" />
                      新增图片模型
                    </Button>}
                  />

                  <div className={`grid min-w-0 gap-4 ${imageModels.length ? 'xl:grid-cols-[220px_minmax(0,1fr)]' : ''}`}>
                    <div className="space-y-2">
                      {imageModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setSelectedImageModelId(model.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedImageModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                        >
                          <div className="flex min-w-0 items-center gap-2 font-medium">
                            <ImageProviderBadge protocol={model.protocol} />
                            <span className="truncate">{model.name || '未命名模型'}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{isCompleteImageModel(model) ? '配置完成' : '待补全'}</div>
                        </button>
                      ))}
                      {imageModels.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">尚未添加图片模型。</p>}
                    </div>

                    {selectedImageModel && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">配置备注</label>
                          <Input aria-label="图片模型配置备注" value={selectedImageModel.name} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { name: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">协议</label>
                          <Select
                            ariaLabel="图片模型协议" value={selectedImageModel.protocol}
                            onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { protocol: value as ProviderProtocol })}
                            options={[
                              { value: 'google', label: 'Google' },
                              { value: 'openai', label: 'OpenAI Images' },
                              { value: 'grok', label: 'Grok Images' },
                          { value: 'doubao', label: '豆包 Images' },
                          { value: 'alibaba-dashscope', label: '阿里百炼 Images' },
                            ]}
                          />
                        </div>
                        <ModelIdLoadField kindLabel="图片模型" modelId={selectedImageModel.modelId} modelIds={loadedModelIds[modelListKey('image', selectedImageModel.id)] || []}
                          apiKey={selectedImageModel.apiKey} useCustomModelId={selectedImageModel.useCustomModelId !== false}
                          loading={loadingModelListKey === modelListKey('image', selectedImageModel.id)} error={modelLoadErrors[modelListKey('image', selectedImageModel.id)]}
                          onModeChange={(enabled) => handleImageModelModeChange(selectedImageModel, enabled)}
                          onModelIdChange={(modelId) => handleUpdateImageModel(selectedImageModel.id, { modelId })}
                          onLoad={() => loadModelList('image', selectedImageModel.id, selectedImageModel.apiKey, selectedImageModel.protocol)} />
                        <ModelIdModeField kindLabel="图片模型" modelId={selectedImageModel.modelId} customModelId={selectedImageModel.customModelId ?? selectedImageModel.modelId}
                          useCustomModelId={selectedImageModel.useCustomModelId !== false} onModeChange={(enabled) => handleImageModelModeChange(selectedImageModel, enabled)}
                          onCustomModelIdChange={(modelId) => handleUpdateImageModel(selectedImageModel.id, { modelId, customModelId: modelId })} />
                        <div className="space-y-2">
                          <label className="flex h-5 items-center text-sm font-medium leading-5 text-foreground">Base URL</label>
                          <Input aria-label="图片模型 API 地址" value={selectedImageModel.baseUrl} readOnly aria-readonly="true" />
                        </div>
                        <div className="space-y-2">
                          <label className="flex h-5 items-baseline gap-x-2 text-sm font-medium leading-5 text-foreground">
                            <span>API Key</span><span className="text-xs font-normal leading-4 text-muted-foreground">网站里创建的 API</span>
                          </label>
                          <div className="relative">
                            <Input
                              type={showImageApiKey ? "text" : "password"}
                              aria-label="图片模型独立 API Key" value={selectedImageModel.apiKey}
                              onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { apiKey: event.target.value })}
                              className="pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowImageApiKey(!showImageApiKey)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              tabIndex={-1}
                            >
                              {showImageApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">最大参考图数量</label>
                          <Input
                            type="number"
                            min={0}
                            value={selectedImageModel.maxRefImages}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              handleUpdateImageModel(selectedImageModel.id, {
                                maxRefImages: Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0,
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">最大分辨率</label>
                          <Select
                            value={selectedImageModel.maxOutputSize}
                            onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { maxOutputSize: value as ImageModelConfig['maxOutputSize'] })}
                            options={selectedImageOutputSizes.map((size) => ({ value: size, label: size === '512' ? '0.5K' : size }))}
                          />
                        </div>
                        {selectedImageModel.protocol === 'openai' && (
                          <div className="min-w-0 space-y-2">
                            <div className="flex h-5 items-center">
                              <p className="text-sm font-medium leading-5 text-foreground">Image 2 额外参数</p>
                            </div>
                            <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-input px-3">
                              <p className="text-sm leading-5 text-muted-foreground">透明度、质量、风格控件</p>
                              <Switch aria-label="Image 2 额外参数" checked={selectedImageModel.supportsAdvancedParams}
                                onCheckedChange={(checked) => handleUpdateImageModel(selectedImageModel.id, { supportsAdvancedParams: checked })} />
                            </div>
                          </div>
                        )}
                        <div className="min-w-0 space-y-2">
                          <label className="flex h-5 items-center text-sm font-medium leading-5 text-foreground">内置模板</label>
                          <Select className="h-11" ariaLabel="图片模型内置模板" value={selectedImageModel.builtinPreset}
                            onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { builtinPreset: value as ImageModelConfig['builtinPreset'] })}
                            options={builtinImagePresetOptions} />
                        </div>
                        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                          {modelConnectionResults[selectedImageModel.id] ? (
                            <p role="status" className={`flex min-w-0 items-center gap-2 text-sm ${modelConnectionResults[selectedImageModel.id].available ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                              {modelConnectionResults[selectedImageModel.id].available ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
                              <span>{modelConnectionResults[selectedImageModel.id].message}</span>
                            </p>
                          ) : <span />}
                          <div className="flex shrink-0 items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-2" disabled={Boolean(savingAndCheckingModelId)}
                              onClick={() => handleSaveAndCheckModel('image', selectedImageModel)}>
                              <RefreshCw className={`size-4 ${savingAndCheckingModelId === selectedImageModel.id ? 'motion-safe:animate-spin' : ''}`} />
                              {savingAndCheckingModelId === selectedImageModel.id ? '检查中...' : '保存并检查'}
                            </Button>
                          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteImageModel(selectedImageModel.id)}>
                            <Trash2 className="w-4 h-4" />
                            删除模型
                          </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-4 sm:p-5">
                  <SettingsSectionHeading
                    title="文本推理模型配置"
                    description="管理用于 Agent 对话、提示词和图片理解的模型。"
                    action={<Button variant="outline" className="min-h-11 gap-2" onClick={handleAddTextModel}>
                      <Plus className="w-4 h-4" />
                      新增文本推理模型
                    </Button>}
                  />

                  <div className={`grid min-w-0 gap-4 ${textModels.length ? 'xl:grid-cols-[220px_minmax(0,1fr)]' : ''}`}>
                    <div className="space-y-2">
                      {textModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setSelectedTextModelId(model.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedTextModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                        >
                          <div className="flex min-w-0 items-center gap-2 font-medium">
                            <TextProviderBadge provider={model.builtinTemplate && BUILTIN_TEXT_PRESETS[model.builtinTemplate]
                              ? BUILTIN_TEXT_PRESETS[model.builtinTemplate].provider : textProviderForProtocol(model.protocol)} />
                            <span className="truncate">{model.name || '未命名模型'}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{isCompleteTextModel(model) ? '配置完成' : '待补全'}</div>
                        </button>
                      ))}
                      {textModels.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">尚未添加文本推理模型。</p>}
                    </div>

                    {selectedTextModel && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">配置备注</label>
                          <Input aria-label="文本模型配置备注" value={selectedTextModel.name} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { name: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">协议</label>
                          <Select
                            ariaLabel="文本模型协议" value={selectedTextModel.protocol}
                            onValueChange={(value) => {
                              const protocol = value as TextProviderProtocol;
                              const template = getDefaultTextModelTemplate(protocol);
                              if (template) handleApplyTextTemplate(selectedTextModel.id, template.id);
                              else handleUpdateTextModel(selectedTextModel.id, { protocol });
                            }}
                            options={[
                              { value: 'openai-responses', label: getTextProviderLabel('openai-responses') },
                              { value: 'openai-chat-completions', label: getTextProviderLabel('openai-chat-completions') },
                              { value: 'anthropic-messages', label: getTextProviderLabel('anthropic-messages') },
                              { value: 'google-gemini', label: getTextProviderLabel('google-gemini') },
                            ]}
                          />
                        </div>
                        <ModelIdLoadField kindLabel="文本模型" modelId={selectedTextModel.modelId} modelIds={loadedModelIds[modelListKey('text', selectedTextModel.id)] || []}
                          apiKey={selectedTextModel.apiKey} useCustomModelId={selectedTextModel.useCustomModelId !== false}
                          loading={loadingModelListKey === modelListKey('text', selectedTextModel.id)} error={modelLoadErrors[modelListKey('text', selectedTextModel.id)]}
                          onModeChange={(enabled) => handleTextModelModeChange(selectedTextModel, enabled)}
                          onModelIdChange={(modelId) => handleUpdateTextModel(selectedTextModel.id, { modelId })}
                          onLoad={() => loadModelList('text', selectedTextModel.id, selectedTextModel.apiKey, selectedTextModel.protocol)} />
                        <ModelIdModeField kindLabel="文本模型" modelId={selectedTextModel.modelId} customModelId={selectedTextModel.customModelId ?? selectedTextModel.modelId}
                          useCustomModelId={selectedTextModel.useCustomModelId !== false} onModeChange={(enabled) => handleTextModelModeChange(selectedTextModel, enabled)}
                          onCustomModelIdChange={(modelId) => handleUpdateTextModel(selectedTextModel.id, { modelId, customModelId: modelId })} />
                        <div className="space-y-2">
                          <label className="flex h-5 items-center text-sm font-medium leading-5 text-foreground">Base URL</label>
                          <Input aria-label="文本模型 API 地址" value={selectedTextModel.baseUrl} readOnly aria-readonly="true" />
                        </div>
                        <div className="space-y-2">
                          <label className="flex h-5 items-baseline gap-x-2 text-sm font-medium leading-5 text-foreground">
                            <span>API Key</span><span className="text-xs font-normal leading-4 text-muted-foreground">网站里创建的 API</span>
                          </label>
                          <div className="relative">
                            <Input
                              type={showTextApiKey ? "text" : "password"}
                              aria-label="文本模型独立 API Key" value={selectedTextModel.apiKey}
                              onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { apiKey: event.target.value })}
                              className="pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowTextApiKey(!showTextApiKey)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              tabIndex={-1}
                            >
                              {showTextApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0 space-y-2">
                          <label className="text-sm font-medium text-foreground">协议描述</label>
                          <Input value={selectedTextModel.note || ''} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { note: event.target.value })} />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <label className="text-sm font-medium text-foreground">内置模板</label>
                          <Select ariaLabel="文本模型内置模板" value={selectedTextModel.builtinTemplate || ''}
                            onValueChange={(value) => handleApplyTextTemplate(selectedTextModel.id, value as BuiltinTextPresetId)}
                            options={BUILTIN_TEXT_PRESET_OPTIONS.map((option) => {
                              const preset = BUILTIN_TEXT_PRESETS[option.value];
                              return { ...option, label: <span className="flex min-w-0 items-center gap-2"><TextProviderBadge provider={preset.provider} /><span className="truncate">{preset.name}</span></span> };
                            })} />
                        </div>
                        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                          {modelConnectionResults[selectedTextModel.id] ? (
                            <p role="status" className={`flex min-w-0 items-center gap-2 text-sm ${modelConnectionResults[selectedTextModel.id].available ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                              {modelConnectionResults[selectedTextModel.id].available ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
                              <span>{modelConnectionResults[selectedTextModel.id].message}</span>
                            </p>
                          ) : <span />}
                          <div className="flex shrink-0 items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-2" disabled={Boolean(savingAndCheckingModelId)}
                              onClick={() => handleSaveAndCheckModel('text', selectedTextModel)}>
                              <RefreshCw className={`size-4 ${savingAndCheckingModelId === selectedTextModel.id ? 'motion-safe:animate-spin' : ''}`} />
                              {savingAndCheckingModelId === selectedTextModel.id ? '检查中...' : '保存并检查'}
                            </Button>
                          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteTextModel(selectedTextModel.id)}>
                            <Trash2 className="w-4 h-4" />
                            删除模型
                          </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <CommonModelSettings defaults={defaults} imageOptions={completeImageOptions} textOptions={completeTextOptions}
              sliceCapableIds={sliceCapableImageOptions.map(option => option.value)} onChange={setDefaults} />

            <WorkflowModelSettings>
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-semibold text-foreground">各功能的默认模型</h4>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCheckModels} disabled={checkingModels}>
                  <RefreshCw className={`w-4 h-4 ${checkingModels ? 'animate-spin' : ''}`} />
                  {checkingModels ? '检查中...' : '检查模型'}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">文生图默认模型</label>
                  <Select className="min-h-11" ariaLabel="文生图默认模型" value={defaults.textToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, textToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">图生图默认模型</label>
                  <Select className="min-h-11" ariaLabel="图生图默认模型" value={defaults.imageToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">反推提示词默认模型</label>
                  <Select className="min-h-11" ariaLabel="反推提示词默认模型" value={defaults.reversePrompt} onValueChange={(value) => setDefaults((prev) => ({ ...prev, reversePrompt: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Agent 默认模型</label>
                  <Select className="min-h-11" ariaLabel="Agent 默认模型" value={defaults.agent} onValueChange={(value) => setDefaults((prev) => ({ ...prev, agent: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">提示词优化默认模型</label>
                  <Select className="min-h-11" ariaLabel="提示词优化默认模型" value={defaults.promptOptimize} onValueChange={(value) => setDefaults((prev) => ({ ...prev, promptOptimize: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">图片描述默认模型</label>
                  <Select className="min-h-11" ariaLabel="图片描述默认模型" value={defaults.imageDescribe} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageDescribe: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">AI 拆图默认模型</label>
                  <Select className="min-h-11" ariaLabel="AI 拆图默认模型" value={defaults.sliceDecomposition} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceDecomposition: value }))} options={completeTextOptions} />
                  <p className="text-sm leading-6 text-muted-foreground">UI设计模式：识别切片与背景候选，需要视觉能力</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">网页复刻默认模型</label>
                  <Select className="min-h-11" ariaLabel="网页复刻默认模型" value={defaults.sliceReconstruct} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceReconstruct: value }))} options={completeTextOptions} />
                  <p className="text-sm leading-6 text-muted-foreground">UI设计模式：多轮工具调用生成网页，建议用能力更强的模型</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">切图图片编辑默认模型</label>
                  <Select className="min-h-11" ariaLabel="切图图片编辑默认模型" value={defaults.sliceImageEdit} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceImageEdit: value }))} options={sliceCapableImageOptions} />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {sliceCapableImageOptions.length === 0
                      ? '需要一个 OpenAI 协议的图片模型；Gemini / Grok 不支持带蒙版的局部编辑'
                      : 'AI 透明化与背景补齐使用，仅支持 OpenAI 协议'}
                  </p>
                </div>
              </div>

              {modelCheckError && <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{modelCheckError}</div>}
              {modelStatuses && (
                <div className="grid gap-2 md:grid-cols-2">
                  {modelStatuses.map((status) => (
                    <div key={status.modelId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{getTextModelLabel(textModels, status.modelId) ?? getImageModelLabel(imageModels, status.modelId) ?? status.actualName ?? status.modelId}</div>
                        <div className="truncate text-xs text-muted-foreground">{status.message || status.actualName || status.modelId}</div>
                      </div>
                      {status.available ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
                    </div>
                  ))}
                </div>
              )}
            </WorkflowModelSettings>
          </TabsContent>

          <TabsContent value="plugins" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 mt-0">
            <PluginsSettings />
          </TabsContent>

          <TabsContent value="backup" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 mt-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <SettingsSectionHeading title="数据备份与恢复" description="导出所有数据（模型配置、任务历史、设置、图片）为 ZIP 压缩包，或从备份文件恢复数据。" />
              </div>

              <BackupProgress percent={backupProgress.percent} message={backupProgress.message} isActive={isBackupActive} />

              {backupSuccess && !isBackupActive && (
                <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-500 mt-0.5" />
                  <p className="text-sm text-emerald-900 dark:text-emerald-100">{backupSuccess}</p>
                </div>
              )}

              {backupError && !isBackupActive && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                  <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive break-all">{backupError}</p>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="text-base font-semibold text-foreground">导出数据</h4>
                    <p className="text-sm leading-6 text-muted-foreground">将所有数据打包为 ZIP 文件下载到本地。备份文件包含模型配置和本地记录，请自行保管。</p>
                    <Button onClick={() => handleExport(false)} disabled={isBackupActive} className="gap-2">
                      <Download className="w-4 h-4" />
                      全量备份
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(true)} disabled={isBackupActive} className="ml-2 gap-2">仅配置备份</Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="text-base font-semibold text-foreground">导入数据</h4>
                    <p className="text-sm leading-6 text-muted-foreground">从备份文件恢复数据。<span className="font-semibold text-destructive">警告：这会覆盖现有数据。</span></p>
                    <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelect} className="hidden" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isBackupActive} variant="outline" className="gap-2">
                      <Upload className="w-4 h-4" />
                      选择备份文件
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="about" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 mt-0">
            <div className="space-y-4 text-sm">
              <details className="group rounded-xl border border-border bg-card p-4 sm:p-5">
                <summary className="flex min-h-8 cursor-pointer select-none items-center gap-3 text-base font-semibold text-foreground">
                  <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">▶</span>
                  使用方法
                </summary>
                <ol className="mt-3 list-decimal list-inside space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>先完成至少一个图片模型和一个文本模型的全部信息。（中转站创建2个API，一个用于GPT推理，一个是生图专用的API）</li>
                  <li>保存后，外部工作区只会显示这些配置完整的模型。</li>
                  <li>再为各工作流指定默认模型，即可开始生图、反推或 Agent 工作流。</li>
                </ol>
              </details>

              <details className="group rounded-xl border border-border bg-card p-4 sm:p-5">
                <summary className="flex min-h-8 cursor-pointer select-none items-center gap-3 text-base font-semibold text-foreground">
                  <span className="text-xs text-muted-foreground transition-transform group-open:rotate-90">▶</span>
                  隐私条款
                </summary>
                <ul className="mt-3 list-disc list-inside space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>本站为本地优先应用：模型配置、任务历史、设置与生成图片默认保存在你的浏览器本地。</li>
                  <li>每个模型的 API Key 和 Base URL 仅用于调用你自己配置的上游服务。</li>
                  <li>生图、反推、Agent、提示词优化等功能会把你当前选择的提示词、参考图或对话内容发送到对应模型配置的上游接口。</li>
                  <li>UI设计模式会把源图截图、切图资产总览图与对话内容发送到你配置的文本/图片模型；切图工作区与图片数据只存在本地 IndexedDB。</li>
                  <li>备份文件可能包含模型配置、本地任务记录与图片数据，请自行妥善保管。</li>
                </ul>
              </details>

            </div>
          </TabsContent>
        </Tabs>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t p-3">
          <p role="status" className="min-w-0 flex-1 break-words text-sm leading-5 text-muted-foreground">{isDirty ? '有未保存的配置' : (completeImageOptions.length || completeTextOptions.length ? '配置已保存' : '添加模型后点击保存，即可开始使用')}</p>
          <Button onClick={saveDraft} disabled={isBackupActive} className="min-h-11 shrink-0 gap-2"><Save className="w-4 h-4" />保存配置</Button>
        </div>
        {toast && <Toast toast={toast} onDismiss={dismissToast} />}
        <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <DialogContent><DialogHeader><DialogTitle>丢弃未保存的配置？</DialogTitle><DialogDescription>关闭后将保留上次保存的配置。</DialogDescription></DialogHeader>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmDiscard(false)}>继续编辑</Button><Button variant="destructive" onClick={() => { setConfirmDiscard(false); onClose(); }}>丢弃更改</Button></div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
