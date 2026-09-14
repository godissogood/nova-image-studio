'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
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
  Wand2,
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
import { PluginsSettings } from '@/components/settings/PluginsSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BackupProgress } from '@/components/BackupProgress';
import {
  BUILTIN_IMAGE_PRESETS,
  BUILTIN_IMAGE_PRESET_OPTIONS,
  BUILTIN_TEXT_PRESETS,
  BUILTIN_TEXT_PRESET_OPTIONS,
  DEFAULT_DEFAULTS,
  generateModelId,
  getDefaultTextModelTemplate,
  getTextModelTemplate,
  getCompleteImageModels,
  getCompleteTextModels,
  getImageModelOutputSizes,
  isSliceCapableImageModel,
  loadRegistry,
  saveRegistry,
  type DefaultModels,
  type ImageModelConfig,
  type ProviderProtocol,
  type TextModelConfig,
  type BuiltinTextPreset,
  type BuiltinTextPresetId,
} from '@/lib/nova-models';
import {
  getTextProviderDescription,
  getTextProviderLabel,
  type TextProviderProtocol,
} from '@/lib/nova-text-protocol';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { exportAllData, importAllData, downloadBlob, generateBackupFilename, type BackupProgress as BackupProgressType } from '@/lib/backup-utils';
import { checkModelsAvailability, type ModelStatus } from '@/lib/ccode-task-client';
import { hasAnyApiKey } from '@/lib/settings-storage';
import { BA_RANDOM_URL, BING_WALLPAPER_URL } from '@/lib/constants';
import { PROMPT_DATA_SOURCES, getPromptSourceLabel } from '@/lib/prompt-gallery-data';

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

function createImageModelDraft(): ImageModelConfig {
  const preset = BUILTIN_IMAGE_PRESETS['gpt-image-2'];
  return {
    id: generateModelId('img'),
    protocol: preset.protocol,
    name: '',
    modelId: '',
    apiKey: '',
    baseUrl: preset.baseUrl,
    builtinPreset: preset.id,
    maxRefImages: preset.maxRefImages,
    maxOutputSize: preset.maxOutputSize,
    supportsAdvancedParams: preset.supportsAdvancedParams,
  };
}

function createTextModelDraft(): TextModelConfig {
  const template = getTextModelTemplate('gpt-5.5');
  return {
    id: generateModelId('txt'),
    protocol: template.protocol,
    name: '',
    modelId: '',
    apiKey: '',
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
  return <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${meta.className}`}>{meta.label}</span>;
}

function ImageProviderBadge({ protocol }: { protocol: ProviderProtocol }) {
  const meta = IMAGE_PROVIDER_META[protocol];
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${meta.className}`}>
      {meta.label}
    </span>
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
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setTab(initialTab);
  }

  const [imageModels, setImageModels] = useState<ImageModelConfig[]>([]);
  const [textModels, setTextModels] = useState<TextModelConfig[]>([]);
  const [defaults, setDefaults] = useState<DefaultModels>(DEFAULT_DEFAULTS);
  const [selectedImageModelId, setSelectedImageModelId] = useState('');
  const [selectedTextModelId, setSelectedTextModelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingModels, setCheckingModels] = useState(false);
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[] | null>(null);
  const [modelCheckError, setModelCheckError] = useState<string | null>(null);
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [showTextApiKey, setShowTextApiKey] = useState(false);

  const [backupProgress, setBackupProgress] = useState<BackupProgressType>({ percent: 0, message: '' });
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const registry = loadRegistry();
    setImageModels(registry.imageModels.map(cloneImageModel));
    setTextModels(registry.textModels.map(cloneTextModel));
    setDefaults(normalizeDefaults(registry.defaults, registry.imageModels, registry.textModels));
    setSelectedImageModelId(registry.imageModels[0]?.id || '');
    setSelectedTextModelId(registry.textModels[0]?.id || '');
    setError(null);
    setSuccess(null);
    setModelStatuses(null);
    setModelCheckError(null);
    setBackupError(null);
    setBackupSuccess(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setDefaults((prev) => {
      const next = normalizeDefaults(prev, imageModels, textModels);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [imageModels, isOpen, textModels]);

  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId) || null,
    [imageModels, selectedImageModelId],
  );
  const selectedTextModel = useMemo(
    () => textModels.find((model) => model.id === selectedTextModelId) || null,
    [selectedTextModelId, textModels],
  );

  const handleAddImageModel = () => {
    const draft = createImageModelDraft();
    setImageModels((prev) => [...prev, draft]);
    setSelectedImageModelId(draft.id);
  };

  const handleUpdateImageModel = (id: string, patch: Partial<ImageModelConfig>) => {
    setImageModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      const next = { ...model, ...patch };
      if (patch.builtinPreset) {
        const preset = BUILTIN_IMAGE_PRESETS[patch.builtinPreset];
        next.protocol = preset.protocol;
        next.name = preset.name;
        next.modelId = preset.modelId;
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
    const draft = createTextModelDraft();
    setTextModels((prev) => [...prev, draft]);
    setSelectedTextModelId(draft.id);
  };

  const handleApplyTextTemplate = (id: string, templateId: BuiltinTextPresetId) => {
    const template = getTextModelTemplate(templateId);
    handleUpdateTextModel(id, {
      protocol: template.protocol,
      name: template.name,
      modelId: template.modelId,
      baseUrl: template.baseUrl,
      note: template.note || getTextProviderDescription(template.protocol),
      builtinTemplate: template.id,
    });
  };

  const handleUpdateTextModel = (id: string, patch: Partial<TextModelConfig>) => {
    setTextModels((prev) => prev.map((model) => (model.id === id ? { ...model, ...patch } : model)));
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

  const persistSingleModel = (kind: 'image' | 'text', id: string) => {
    const model = kind === 'image'
      ? imageModels.find((item) => item.id === id)
      : textModels.find((item) => item.id === id);
    if (!model) return;
    const complete = kind === 'image'
      ? isCompleteImageModel(model as ImageModelConfig)
      : isCompleteTextModel(model as TextModelConfig);
    if (!complete) {
      setError(`请先完成${kind === 'image' ? '图片' : '文本'}模型的名称、模型 ID 和 API Key`);
      setSuccess(null);
      return;
    }
    saveRegistry({
      imageModels,
      textModels,
      defaults: normalizeDefaults(defaults, imageModels, textModels),
    });
    syncDynamicModelExports();
    window.dispatchEvent(new Event('nova-model-registry-updated'));
    onApiKeyChange?.(hasAnyApiKey());
    setSuccess(`${model.name || '当前模型'} 已保存`);
    setError(null);
    setModelStatuses(null);
    setModelCheckError(null);
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

  const handleExport = async () => {
    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const blob = await exportAllData((progress) => setBackupProgress(progress));
      const filename = generateBackupFilename();
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
      if (!open) onClose();
    }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 pt-0 gap-0 sm:max-w-5xl">
        <DialogHeader className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <DialogTitle>设置</DialogTitle>
          </div>
          <DialogDescription>按模型分别配置协议、URL 和 API Key。至少完成一个图片模型和一个文本模型后，外部功能才会解锁。</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={value => setTab(value as SettingsTab)} className="min-h-0 flex-1 gap-0">
          <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0">
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

          <TabsContent value="models" className="min-h-0 overflow-y-auto p-4 sm:p-6 mt-0 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">模型级独立配置</p>
                <p className="text-xs text-muted-foreground">每个模型单独记录协议、Base URL、API Key。外部只显示配置完整的模型。</p>
              </div>
            </div>

            {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {success && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{success}</div>}

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">图片模型</p>
                  <p className="text-xs text-muted-foreground">无默认示范记录。请至少完成一个图片模型。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleAddImageModel}>
                  <Plus className="w-4 h-4" />
                  新增图片模型
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {imageModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedImageModelId(model.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedImageModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <ImageProviderBadge protocol={model.protocol} />
                        <span className="truncate">{model.name || '未命名模型'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{isCompleteImageModel(model) ? '配置完成' : '待补全'}</div>
                    </button>
                  ))}
                </div>

                {selectedImageModel && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">内置模板</label>
                      <Select
                        value={selectedImageModel.builtinPreset}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { builtinPreset: value as ImageModelConfig['builtinPreset'] })}
                        options={builtinImagePresetOptions}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">协议</label>
                      <Select
                        value={selectedImageModel.protocol}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { protocol: value as ProviderProtocol })}
                        options={[
                          { value: 'google', label: 'Google' },
                          { value: 'openai', label: 'OpenAI Images' },
                          { value: 'grok', label: 'Grok Images' },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">显示名称</label>
                      <Input value={selectedImageModel.name} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">模型 ID</label>
                      <Input value={selectedImageModel.modelId} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { modelId: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Base URL</label>
                      <Input value={selectedImageModel.baseUrl} readOnly aria-readonly="true" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">API Key</label>
                      <div className="relative">
                        <Input
                          type={showImageApiKey ? "text" : "password"}
                          value={selectedImageModel.apiKey}
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
                      <label className="text-xs text-muted-foreground">最大参考图数量</label>
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
                      <label className="text-xs text-muted-foreground">最大分辨率</label>
                      <Select
                        value={selectedImageModel.maxOutputSize}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { maxOutputSize: value as ImageModelConfig['maxOutputSize'] })}
                        options={selectedImageOutputSizes.map((size) => ({ value: size, label: size === '512' ? '0.5K' : size }))}
                      />
                    </div>
                    {selectedImageModel.protocol === 'openai' && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2 md:col-span-2">
                        <div>
                          <p className="text-sm font-medium">Image 2 额外参数</p>
                          <p className="text-xs text-muted-foreground">透明度、质量、风格控件默认开启，用户可手动关闭。</p>
                        </div>
                        <Switch
                          checked={selectedImageModel.supportsAdvancedParams}
                          onCheckedChange={(checked) => handleUpdateImageModel(selectedImageModel.id, { supportsAdvancedParams: checked })}
                        />
                      </div>
                    )}
                    <div className="md:col-span-2 flex justify-end gap-2">
                      <Button size="sm" className="gap-2" onClick={() => persistSingleModel('image', selectedImageModel.id)}>
                        <Save className="w-4 h-4" />
                        保存模型
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteImageModel(selectedImageModel.id)}>
                        <Trash2 className="w-4 h-4" />
                        删除模型
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">文本模型</p>
                  <p className="text-xs text-muted-foreground">无默认示范记录。请至少完成一个文本模型。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleAddTextModel}>
                  <Plus className="w-4 h-4" />
                  新增文本模型
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {textModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedTextModelId(model.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedTextModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {model.builtinTemplate && BUILTIN_TEXT_PRESETS[model.builtinTemplate] && <TextProviderBadge provider={BUILTIN_TEXT_PRESETS[model.builtinTemplate].provider} />}
                        <span className="truncate">{model.name || '未命名模型'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{isCompleteTextModel(model) ? '配置完成' : '待补全'}</div>
                    </button>
                  ))}
                </div>

                {selectedTextModel && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">内置模板</label>
                      <Select
                        value={selectedTextModel.builtinTemplate || ''}
                        onValueChange={(value) => handleApplyTextTemplate(selectedTextModel.id, value as BuiltinTextPresetId)}
                        options={BUILTIN_TEXT_PRESET_OPTIONS.map((option) => {
                          const preset = BUILTIN_TEXT_PRESETS[option.value];
                          return {
                            ...option,
                            label: <span className="flex min-w-0 items-center gap-2"><TextProviderBadge provider={preset.provider} /><span className="truncate">{preset.name}</span></span>,
                          };
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">协议</label>
                      <Select
                        value={selectedTextModel.protocol}
                        onValueChange={(value) => {
                          const protocol = value as TextProviderProtocol;
                          handleUpdateTextModel(selectedTextModel.id, { protocol });
                          const template = getDefaultTextModelTemplate(protocol);
                          if (template) handleApplyTextTemplate(selectedTextModel.id, template.id);
                        }}
                        options={[
                          { value: 'openai-responses', label: getTextProviderLabel('openai-responses') },
                          { value: 'openai-chat-completions', label: getTextProviderLabel('openai-chat-completions') },
                          { value: 'anthropic-messages', label: getTextProviderLabel('anthropic-messages') },
                          { value: 'google-gemini', label: getTextProviderLabel('google-gemini') },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">显示名称</label>
                      <Input value={selectedTextModel.name} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">模型 ID</label>
                      <Input value={selectedTextModel.modelId} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { modelId: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Base URL</label>
                      <Input value={selectedTextModel.baseUrl} readOnly aria-readonly="true" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">API Key</label>
                      <div className="relative">
                        <Input
                          type={showTextApiKey ? "text" : "password"}
                          value={selectedTextModel.apiKey}
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
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs text-muted-foreground">协议描述</label>
                      <Input value={selectedTextModel.note || ''} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { note: event.target.value })} />
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-2">
                      <Button size="sm" className="gap-2" onClick={() => persistSingleModel('text', selectedTextModel.id)}>
                        <Save className="w-4 h-4" />
                        保存模型
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteTextModel(selectedTextModel.id)}>
                        <Trash2 className="w-4 h-4" />
                        删除模型
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">默认模型</p>
                  <p className="text-xs text-muted-foreground">这里只会显示已经配置完整的模型。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCheckModels} disabled={checkingModels}>
                  <RefreshCw className={`w-4 h-4 ${checkingModels ? 'animate-spin' : ''}`} />
                  {checkingModels ? '检查中...' : '检查模型'}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">文生图默认模型</label>
                  <Select value={defaults.textToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, textToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图生图默认模型</label>
                  <Select value={defaults.imageToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">反推提示词默认模型</label>
                  <Select value={defaults.reversePrompt} onValueChange={(value) => setDefaults((prev) => ({ ...prev, reversePrompt: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Agent 默认模型</label>
                  <Select value={defaults.agent} onValueChange={(value) => setDefaults((prev) => ({ ...prev, agent: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">提示词优化默认模型</label>
                  <Select value={defaults.promptOptimize} onValueChange={(value) => setDefaults((prev) => ({ ...prev, promptOptimize: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图片描述默认模型</label>
                  <Select value={defaults.imageDescribe} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageDescribe: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">AI 拆图默认模型</label>
                  <Select value={defaults.sliceDecomposition} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceDecomposition: value }))} options={completeTextOptions} />
                  <p className="text-[11px] text-muted-foreground">UI设计模式：识别切片与背景候选，需要视觉能力</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">网页复刻默认模型</label>
                  <Select value={defaults.sliceReconstruct} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceReconstruct: value }))} options={completeTextOptions} />
                  <p className="text-[11px] text-muted-foreground">UI设计模式：多轮工具调用生成网页，建议用能力更强的模型</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">切图图片编辑默认模型</label>
                  <Select value={defaults.sliceImageEdit} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceImageEdit: value }))} options={sliceCapableImageOptions} />
                  <p className="text-[11px] text-muted-foreground">
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
            </div>
          </TabsContent>

          <TabsContent value="plugins" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 mt-0">
            <PluginsSettings />
          </TabsContent>

          <TabsContent value="backup" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 mt-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-base font-medium">数据备份与恢复</h3>
                <p className="text-sm text-muted-foreground">导出所有数据（模型配置、任务历史、设置、图片）为 ZIP 压缩包，或从备份文件恢复数据。</p>
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

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium">导出数据</h4>
                    <p className="text-sm text-muted-foreground">将所有数据打包为 ZIP 文件下载到本地。备份文件包含模型配置和本地记录，请自行保管。</p>
                    <Button onClick={handleExport} disabled={isBackupActive} className="gap-2">
                      <Download className="w-4 h-4" />
                      全量备份
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium">导入数据</h4>
                    <p className="text-sm text-muted-foreground">从备份文件恢复数据。<span className="font-medium text-destructive">警告：这会覆盖现有数据。</span></p>
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
              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  使用方法
                </summary>
                <ol className="mt-3 list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>先完成至少一个图片模型和一个文本模型的全部信息。（中转站创建2个API，一个用于GPT推理，一个是生图专用的API）</li>
                  <li>保存后，外部工作区只会显示这些配置完整的模型。</li>
                  <li>再为各工作流指定默认模型，即可开始生图、反推或 Agent 工作流。</li>
                </ol>
              </details>

              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  隐私条款
                </summary>
                <ul className="mt-3 list-disc list-inside space-y-2 text-muted-foreground">
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
      </DialogContent>
    </Dialog>
  );
}
