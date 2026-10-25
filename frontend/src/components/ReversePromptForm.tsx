'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  Info,
  Loader2,
  ScanSearch,
  Square,
  X,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HistoryImagePreview } from '@/components/workspace/results/HistoryImagePreview';
import { ImageHoverActions } from '@/components/workspace/results/ImageHoverActions';
import { MissingApiKeyDialog } from '@/components/MissingApiKeyDialog';
import { cn } from '@/lib/utils';
import { prepareUploadImage } from '@/lib/upload-image-cache';
import { streamReversePrompt, type StreamReverseHandle } from '@/lib/reverse-prompt-client';
import {
  DEFAULT_REVERSE_MODE,
  getDefaultReversePromptModelId,
  REVERSE_PROMPT_MODE_OPTIONS,
  getReversePromptModelOptionsList,
  getReverseModelOption,
  getReverseModeOption,
  isReversePromptMode,
  isReversePromptModel,
  type ReversePromptMode,
  type ReversePromptModelId,
} from '@/lib/reverse-prompt-config';
import { getConfiguredTextModel } from '@/lib/model-endpoints';
import {
  clearReverseDraft,
  loadReverseResults,
  resolveReverseDraftFiles,
  saveReverseDraft,
  saveReverseResult,
} from '@/lib/reverse-prompt-store';
import type { ImageActionPayload } from '@/lib/image-actions';

import { MAX_UPLOAD_SIZE_BYTES } from '@/lib/constants';
import { loadJsonFromStorage, saveJsonToStorage } from '@/lib/settings-storage';

const REVERSE_SETTINGS_KEY = 'nova-reverse-prompt-settings';
/** 缩略图区：2 行 × 3 列 = 6；第 7 张起左右翻页 */
const THUMB_PAGE_SIZE = 6;
const MAX_REVERSE_IMAGES = 30;

interface ReverseSettings {
  model: ReversePromptModelId;
  mode: ReversePromptMode;
}

interface UploadedFile {
  id: string;
  name: string;
  preview: string;
  dataUrl: string;
  mimeType: string;
  badge?: string;
}

interface ReverseResult {
  text: string;
  model: ReversePromptModelId;
  mode: ReversePromptMode;
  finished: boolean; // 是否流式已结束
  aborted?: boolean;
}

function getOptimizationBadge(originalSize: number, processedSize: number, cacheHit: boolean): string | undefined {
  if (cacheHit) return '缓存';
  if (originalSize <= 0 || processedSize >= originalSize) return undefined;
  const savedPercent = Math.round((1 - processedSize / originalSize) * 100);
  return savedPercent >= 5 ? `-${savedPercent}%` : undefined;
}

interface ReversePromptFormProps {
  wideMode?: boolean;
  disabled?: boolean;
  onConfigureApiKey?: () => void;
}

export function ReversePromptForm({ wideMode = false, disabled = false, onConfigureApiKey }: ReversePromptFormProps) {
  const [model, setModel] = useState<ReversePromptModelId>(getDefaultReversePromptModelId());
  const [mode, setMode] = useState<ReversePromptMode>(DEFAULT_REVERSE_MODE);
  const [settingsReady, setSettingsReady] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [thumbPageIndex, setThumbPageIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [currentResult, setCurrentResult] = useState<ReverseResult | null>(null);
  const [previousResult, setPreviousResult] = useState<ReverseResult | null>(null);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'current' | 'previous' | null>(null);

  const [missingApiKeyDialogOpen, setMissingApiKeyDialogOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [modePopoverOpen, setModePopoverOpen] = useState(false);

  const streamHandleRef = useRef<StreamReverseHandle | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const thumbPageCount = Math.max(1, Math.ceil(pendingFiles.length / THUMB_PAGE_SIZE));
  const safeThumbPage = Math.min(thumbPageIndex, thumbPageCount - 1);
  const pageThumbs = useMemo(
    () => pendingFiles.slice(safeThumbPage * THUMB_PAGE_SIZE, safeThumbPage * THUMB_PAGE_SIZE + THUMB_PAGE_SIZE),
    [pendingFiles, safeThumbPage],
  );
  const showThumbPager = pendingFiles.length > THUMB_PAGE_SIZE;
  const primaryFile = pendingFiles[0] ?? null;

  // 挂载后恢复缓存设置 + 从 IndexedDB 恢复反推结果
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const saved = loadJsonFromStorage<ReverseSettings>(REVERSE_SETTINGS_KEY);
      const fallbackModel = getDefaultReversePromptModelId();
      if (saved.model && isReversePromptModel(saved.model) && getConfiguredTextModel(saved.model)) {
        setModel(saved.model);
      } else if (fallbackModel) {
        setModel(fallbackModel);
      }
      if (saved.mode && isReversePromptMode(saved.mode)) {
        setMode(saved.mode);
      }
      setSettingsReady(true);

    // 恢复反推结果
    void loadReverseResults().then((stored) => {
      if (stored.current) {
        setCurrentResult({
          text: stored.current.text,
          model: stored.current.model as ReversePromptModelId,
          mode: stored.current.mode as ReversePromptMode,
          finished: true,
          aborted: stored.current.aborted,
        });
      }
      if (stored.previous) {
        setPreviousResult({
          text: stored.previous.text,
          model: stored.previous.model as ReversePromptModelId,
          mode: stored.previous.mode as ReversePromptMode,
          finished: true,
          aborted: stored.previous.aborted,
        });
      }
      const draftFiles = resolveReverseDraftFiles(stored.draft);
      if (draftFiles.length > 0) {
        setPendingFiles(draftFiles);
      }
    });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 设置变化时持久化
  useEffect(() => {
    if (!settingsReady) return;
    saveJsonToStorage(REVERSE_SETTINGS_KEY, { model, mode });
  }, [model, mode, settingsReady]);

  // 卸载时取消正在进行的流
  useEffect(() => {
    return () => {
      streamHandleRef.current?.abort();
      streamHandleRef.current = null;
    };
  }, []);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) {
      setUploadError('请选择图像文件');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const prepared: UploadedFile[] = [];
      let lastError: string | null = null;
      for (const file of arr) {
        try {
          const optimized = await prepareUploadImage(file);
          if (optimized.processedSize > MAX_UPLOAD_SIZE_BYTES) {
            lastError = `文件过大: ${file.name}，压缩后仍超过 10MB`;
            continue;
          }
          prepared.push({
            id: optimized.id,
            name: optimized.name,
            preview: optimized.preview,
            dataUrl: optimized.dataUrl,
            mimeType: optimized.mimeType,
            badge: getOptimizationBadge(optimized.originalSize, optimized.processedSize, optimized.cacheHit),
          });
        } catch {
          lastError = `文件读取失败: ${file.name}`;
        }
      }

      let overflow = false;
      let nextList: UploadedFile[] = [];
      setPendingFiles((prev) => {
        nextList = [...prev];
        for (const item of prepared) {
          if (nextList.length >= MAX_REVERSE_IMAGES) {
            overflow = true;
            break;
          }
          if (nextList.some((existing) => existing.id === item.id)) continue;
          nextList.push(item);
        }
        return nextList;
      });
      void saveReverseDraft(nextList);
      setThumbPageIndex(Math.max(0, Math.ceil(Math.max(nextList.length, 1) / THUMB_PAGE_SIZE) - 1));
      if (overflow) {
        setUploadError(`最多上传 ${MAX_REVERSE_IMAGES} 张，已添加可容纳的图片`);
      } else if (lastError) {
        setUploadError(lastError);
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  }, [disabled, processFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (next.length === 0) void clearReverseDraft();
      else void saveReverseDraft(next);
      return next;
    });
    setPreviewIndex(null);
  }, []);

  const handleClearDraft = () => {
    setPendingFiles([]);
    setThumbPageIndex(0);
    setPreviewIndex(null);
    setUploadError(null);
    void clearReverseDraft();
  };

  // 粘贴图片支持
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || uploading || streaming) return;
      const target = e.target as HTMLElement;
      // 只处理粘贴目标在本表单容器内的事件，避免与其他全局粘贴处理器冲突
      if (!formRef.current?.contains(target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFiles(imageFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, uploading, streaming, processFiles]);

  const handleSubmit = () => {
    if (!primaryFile || streaming || disabled) return;
    const configuredModel = getConfiguredTextModel(model);
    if (!configuredModel?.apiKey || !configuredModel.baseUrl || !configuredModel.modelId) {
      setMissingApiKeyDialogOpen(true);
      return;
    }

    // 把上一次结果挪到「上次结果」槽
    if (currentResult && currentResult.text.length > 0) {
      setPreviousResult(currentResult);
      setPreviousExpanded(false);
      // 持久化上次结果
      void saveReverseResult({
        slot: 'previous',
        text: currentResult.text,
        model: currentResult.model,
        mode: currentResult.mode,
        aborted: currentResult.aborted,
        timestamp: Date.now(),
      });
    }
    setCurrentResult({ text: '', model, mode, finished: false });
    setError(null);
    setStreaming(true);

    // 中断正在进行的旧请求（如果有）
    streamHandleRef.current?.abort();

    const handle = streamReversePrompt(
      {
        apiKey: configuredModel.apiKey,
        model: configuredModel.id,
        mode,
        imageDataUrl: primaryFile.dataUrl,
        mimeType: primaryFile.mimeType,
      },
      {
        onDelta: (token) => {
          setCurrentResult(prev => prev ? { ...prev, text: prev.text + token } : prev);
        },
        onDone: (fullText) => {
          setCurrentResult(prev => prev ? {
            ...prev,
            text: fullText.length > prev.text.length ? fullText : prev.text,
            finished: true,
          } : prev);
          setStreaming(false);
          streamHandleRef.current = null;
          // 持久化当前结果
          if (fullText.length > 0) {
            void saveReverseResult({
              slot: 'current',
              text: fullText,
              model,
              mode,
              aborted: false,
              timestamp: Date.now(),
            });
          }
        },
        onError: (err) => {
          setError(err.message || '反推失败，请稍后重试');
          setCurrentResult(prev => {
            if (prev && prev.text.length > 0) {
              // 失败时如果有内容也持久化
              void saveReverseResult({
                slot: 'current',
                text: prev.text,
                model,
                mode,
                aborted: false,
                timestamp: Date.now(),
              });
            }
            return prev ? { ...prev, finished: true } : prev;
          });
          setStreaming(false);
          streamHandleRef.current = null;
        },
      },
      configuredModel.baseUrl
    );
    streamHandleRef.current = handle;
  };

  const handleAbort = () => {
    streamHandleRef.current?.abort();
    streamHandleRef.current = null;
    setStreaming(false);
    setCurrentResult(prev => {
      if (prev && prev.text.length > 0) {
        // 停止时如果有内容也持久化
        void saveReverseResult({
          slot: 'current',
          text: prev.text,
          model: prev.model,
          mode: prev.mode,
          aborted: true,
          timestamp: Date.now(),
        });
      }
      return prev ? { ...prev, finished: true, aborted: true } : prev;
    });
  };

  const handleCopy = async (text: string, slot: 'current' | 'previous') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(slot);
      setTimeout(() => setCopyState(prev => (prev === slot ? null : prev)), 1500);
    } catch {
      setError('复制失败，请手动选择文字复制');
    }
  };

  const canSubmit = !!primaryFile && !disabled && !uploading && !streaming;
  const reverseModelOptions = getReversePromptModelOptionsList();
  const modelLabel = getReverseModelOption(model).label;
  const modeOption = getReverseModeOption(mode);

  const previewImages = pendingFiles.map((file) => file.preview).filter(Boolean);
  const previewPayloads = pendingFiles.map<ImageActionPayload>((file) => ({
    id: file.id,
    name: file.name,
    dataUrl: file.dataUrl || file.preview,
    src: file.preview,
    mimeType: file.mimeType,
    sourceKind: 'reverse-prompt',
    sourceLabel: '反推提示词上传图',
    sourceRef: file.id,
  }));
  const currentPreview = previewIndex === null ? null : pendingFiles[previewIndex]?.preview;
  const currentPreviewImageIndex = currentPreview ? previewImages.indexOf(currentPreview) : -1;

  return (
    <div
      ref={formRef}
      className={cn(
        'space-y-4',
        wideMode && 'grid min-h-0 flex-1 items-stretch gap-5 xl:grid-cols-[minmax(400px,0.85fr)_minmax(0,1.25fr)] xl:space-y-0'
      )}
    >
      <div className={cn(wideMode && 'flex min-h-0 h-full flex-col')}>
      <div className={cn(
        'rounded-xl border border-border bg-muted/50 shadow-md',
        wideMode && 'flex min-h-0 flex-1 flex-col overflow-hidden'
      )}>
        {disabled ? (
          <div className={cn(
            'flex flex-col items-center justify-center gap-4 px-4 py-8 text-center',
            wideMode ? 'min-h-0 flex-1' : 'min-h-40'
          )}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div className="max-w-md">
              <p className="text-base font-medium text-foreground">需要先配置令牌</p>
              <p className="mt-2 text-sm text-muted-foreground">
                请先在设置中配置 Nova API 密钥，配置完成后即可使用反推提示词功能。
              </p>
            </div>
            <Button onClick={() => setMissingApiKeyDialogOpen(true)}>配置</Button>
          </div>
        ) : (
          <div className={cn('flex flex-col', wideMode && 'min-h-0 flex-1')}>
            {/* 紧凑上传区 */}
            <div className="shrink-0 p-4 pb-2">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all',
                  isDragOver
                    ? 'border-primary bg-primary/20'
                    : 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading || streaming}
                  className="hidden"
                />
                <CloudUpload className={cn('mx-auto mb-1 h-5 w-5', isDragOver ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm font-medium">
                  {uploading ? '读取中...' : isDragOver ? '将图像拖放到这里' : '拖放参考图到此处'}
                </p>
                <p className="text-xs text-muted-foreground">点击选择 · 拖放 · Ctrl+V 粘贴 · 可多张</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  已上传 {pendingFiles.length} / {MAX_REVERSE_IMAGES} 张
                </p>
              </div>
            </div>

            {/* 缩略图：最多 2 行 × 3 列，第 7 张起左右翻页 */}
            <div className={cn('flex min-h-0 flex-col px-4 pb-2', wideMode && 'flex-1')}>
              {pendingFiles.length === 0 ? (
                <div className={cn(
                  'grid place-items-center rounded-xl border border-dashed border-border/70 bg-background/40 text-xs text-muted-foreground',
                  wideMode ? 'min-h-0 flex-1' : 'min-h-36'
                )}>
                  上传后的图片会出现在这里
                </div>
              ) : (
                <div className={cn('relative min-h-0', wideMode && 'flex flex-1 flex-col')}>
                  <div className={cn('grid grid-cols-3 gap-2 content-start', wideMode && 'min-h-0 flex-1')}>
                    {pageThumbs.map((file, localIndex) => {
                      const absoluteIndex = safeThumbPage * THUMB_PAGE_SIZE + localIndex;
                      return (
                        <div key={file.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                          <button
                            type="button"
                            className="absolute inset-0"
                            onClick={() => setPreviewIndex(absoluteIndex)}
                            aria-label={`预览 ${file.name}`}
                          >
                            <img src={file.preview} alt={file.name} className="size-full object-cover" />
                          </button>
                          <button
                            type="button"
                            className="absolute top-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveFile(file.id);
                            }}
                            aria-label={`移除 ${file.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                          {file.badge && (
                            <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                              {file.badge}
                            </span>
                          )}
                          {file.preview && (
                            <ImageHoverActions
                              payload={previewPayloads[absoluteIndex]}
                              onPreview={() => setPreviewIndex(absoluteIndex)}
                              compact
                              showDownload={false}
                              showCopy
                              showAddToAssets
                              showUseAsReference={false}
                              className="rounded-xl"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {showThumbPager && (
                    <div className="mt-2 flex shrink-0 items-center justify-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-full"
                        disabled={safeThumbPage <= 0}
                        aria-label="上一页图片"
                        onClick={() => setThumbPageIndex((current) => Math.max(0, current - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {safeThumbPage + 1}/{thumbPageCount} · {pendingFiles.length}张
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-full"
                        disabled={safeThumbPage >= thumbPageCount - 1}
                        aria-label="下一页图片"
                        onClick={() => setThumbPageIndex((current) => Math.min(thumbPageCount - 1, current + 1))}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 控件栏：模型 / 模式带标签提示，对齐视频创作 */}
            <div className="mt-auto flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border/80 px-4 py-3">
              {/* 模型选择 */}
              <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                <PopoverTrigger
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'xs' }),
                    'h-7 gap-1.5 border-primary/40 bg-primary/8 px-2 text-foreground shadow-xs hover:border-primary/60 hover:bg-primary/12'
                  )}
                  title="模型选择"
                >
                  <span className="text-[11px] font-semibold text-primary">模型</span>
                  <span className="h-3 w-px bg-primary/30" />
                  <span className="max-w-40 truncate text-[12px] font-semibold">{modelLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-primary" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1.5" align="start">
                  <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold tracking-wide text-primary">选择模型</p>
                  {reverseModelOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setModel(option.value);
                        setTimeout(() => setModelPopoverOpen(false), 0);
                      }}
                      className={cn(
                        'w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
                        model === option.value && 'bg-muted font-medium'
                      )}
                    >
                      <div>{option.label}</div>
                      <div className={cn('mt-0.5 text-[11px]', model === option.value ? 'opacity-90' : 'opacity-70')}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* 模式选择 */}
              <Popover open={modePopoverOpen} onOpenChange={setModePopoverOpen}>
                <PopoverTrigger
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'xs' }),
                    'h-7 gap-1.5 border-primary/40 bg-primary/8 px-2 text-foreground shadow-xs hover:border-primary/60 hover:bg-primary/12'
                  )}
                  title="反推模式"
                >
                  <span className="text-[11px] font-semibold text-primary">模式</span>
                  <span className="h-3 w-px bg-primary/30" />
                  <span className="max-w-40 truncate text-[12px] font-semibold">{modeOption.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-primary" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1.5" align="start">
                  <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold tracking-wide text-primary">选择模式</p>
                  {REVERSE_PROMPT_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setMode(option.value);
                        setTimeout(() => setModePopoverOpen(false), 0);
                      }}
                      className={cn(
                        'w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
                        mode === option.value && 'bg-muted font-medium'
                      )}
                    >
                      <div>{option.label}</div>
                      <div className={cn('mt-0.5 text-[11px]', mode === option.value ? 'opacity-90' : 'opacity-70')}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClearDraft}
                  disabled={disabled || (pendingFiles.length === 0 && !uploadError)}
                  title="清空已上传图片"
                >
                  <X className="w-5 h-5" />
                </Button>
                {streaming ? (
                  <Button
                    onClick={handleAbort}
                    size="icon"
                    variant="destructive"
                    title="停止反推"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    size="icon"
                    title="开始反推提示词"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {previewIndex !== null && currentPreviewImageIndex >= 0 && typeof document !== 'undefined' && createPortal(
        <HistoryImagePreview
          images={previewImages}
          alt={pendingFiles[previewIndex]?.name || '参考图像'}
          initialIndex={currentPreviewImageIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={(nextIndex) => {
            const nextFileIndex = pendingFiles.findIndex((file) => file.preview === previewImages[nextIndex]);
            if (nextFileIndex >= 0) setPreviewIndex(nextFileIndex);
          }}
          actionPayloads={previewPayloads}
          showDownload={false}
          showCopy
          showAddToAssets
          showUseAsReference={false}
        />,
        document.body
      )}

      <div
        className={cn(
          'space-y-4',
          wideMode && 'flex min-h-0 h-full flex-col overflow-y-auto pr-1'
        )}
      >
      {wideMode && !disabled && !currentResult && !previousResult && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <ScanSearch className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">反推结果会显示在这里</p>
        </div>
      )}

      {/* 当前结果 */}
      {currentResult && (
        <ResultPanel
          title="反推结果"
          result={currentResult}
          streaming={streaming}
          copied={copyState === 'current'}
          onCopy={() => handleCopy(currentResult.text, 'current')}
          onAbort={streaming ? handleAbort : undefined}
        />
      )}

      {/* 上次结果（折叠） */}
      {previousResult && (
        <div className="rounded-xl border border-border bg-card/60 shadow-sm">
          <button
            type="button"
            onClick={() => setPreviousExpanded(p => !p)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              {previousExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>上次结果</span>
              <span className="text-xs text-muted-foreground">
                · {getReverseModelOption(previousResult.model).label} · {getReverseModeOption(previousResult.mode).label}
              </span>
            </span>
          </button>
          {previousExpanded && (
            <div className="border-t border-border px-4 pb-4 pt-3">
              <ResultPanel
                title="上次结果"
                result={previousResult}
                streaming={false}
                inline
                copied={copyState === 'previous'}
                onCopy={() => handleCopy(previousResult.text, 'previous')}
              />
            </div>
          )}
        </div>
      )}
      </div>

      <MissingApiKeyDialog
        open={missingApiKeyDialogOpen}
        onOpenChange={setMissingApiKeyDialogOpen}
        onConfigure={() => onConfigureApiKey?.()}
      />
    </div>
  );
}

interface ResultPanelProps {
  title: string;
  result: ReverseResult;
  streaming: boolean;
  copied: boolean;
  inline?: boolean;
  onCopy: () => void;
  onAbort?: () => void;
}

function ResultPanel({ title, result, streaming, copied, inline, onCopy, onAbort }: ResultPanelProps) {
  const modelLabel = getReverseModelOption(result.model).label;
  const modeLabel = getReverseModeOption(result.mode).label;
  const isEmpty = result.text.length === 0;
  const showWaitingHint = streaming && isEmpty;

  return (
    <div className={cn(!inline && 'rounded-xl border border-border bg-card/60 p-4 shadow-sm')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {!inline && <span className="font-medium text-foreground">{title}</span>}
          <span className="rounded-full bg-muted px-2 py-0.5">{modelLabel}</span>
          <span className="rounded-full bg-muted px-2 py-0.5">{modeLabel}</span>
          {streaming && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>生成中</span>
            </span>
          )}
          {result.aborted && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">已停止</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onAbort && (
            <Button variant="outline" size="xs" className="gap-1" onClick={onAbort} title="停止生成">
              <Square className="w-3 h-3" />
              <span>停止</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            onClick={onCopy}
            disabled={isEmpty}
            title="复制全文"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-3 text-sm leading-relaxed',
          showWaitingHint && 'text-muted-foreground italic'
        )}
      >
        {showWaitingHint ? '正在思考与生成中，请稍候...' : (result.text || '（无内容）')}
        {streaming && !isEmpty && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary/70" />
        )}
      </div>
    </div>
  );
}
