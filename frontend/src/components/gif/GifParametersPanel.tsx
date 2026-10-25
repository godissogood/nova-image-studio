'use client';

import {
  ArrowUp,
  ChevronDown,
  CloudUpload,
  Info,
  Link,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AttachmentChips } from '@/components/AttachmentChips';
import { GptImageAdvancedParamsControl } from '@/components/GptImageAdvancedParamsControl';
import { cn } from '@/lib/utils';
import {
  GIF_MAX_REF_IMAGES,
  type GifModel,
} from '@/lib/gif-job-store';
import type { RefImageData } from '@/lib/job-store';
import { supportsGptImageAdvancedParams, type GptImageAdvancedParams } from '@/lib/model-capabilities';

export interface GifUploadedRef extends RefImageData {
  preview: string;
  badge?: string;
}

export interface GifParametersPanelProps {
  wideMode?: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  model: GifModel;
  modelOptions: { value: GifModel; label: string }[];
  modelPopoverOpen: boolean;
  onModelPopoverOpenChange: (open: boolean) => void;
  onModelChange: (value: GifModel) => void;
  gptImageAdvancedParams: GptImageAdvancedParams;
  onGptImageAdvancedParamsChange: (value: GptImageAdvancedParams) => void;
  closedLoop: boolean;
  onClosedLoopToggle: (value: boolean) => void;
  refFiles: GifUploadedRef[];
  onRemoveRef: (id: string) => void;
  maxedOut: boolean;
  isDragOver: boolean;
  uploading: boolean;
  uploadError: string | null;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  generating: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onConfigureApiKey: () => void;
  onOptimize: () => void;
  onClear: () => void;
}

function formatModelLabel(model: GifModel, modelOptions: { value: GifModel; label: string }[]): string {
  return modelOptions.find(option => option.value === model)?.label || model;
}

export function GifParametersPanel(props: GifParametersPanelProps) {
  if (props.disabled) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/40 px-4 py-8 text-center',
        props.wideMode ? 'min-h-0 flex-1' : 'min-h-72'
      )}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Info className="h-5 w-5" />
        </div>
        <div className="max-w-md">
          <p className="text-base font-medium text-foreground">需要先配置令牌</p>
          <p className="mt-2 text-sm text-muted-foreground">
            请先在设置中配置 Nova API 密钥，才能使用动图生成功能。
          </p>
        </div>
        <Button onClick={props.onConfigureApiKey}>配置</Button>
      </div>
    );
  }

  if (props.modelOptions.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/40 px-4 py-8 text-center',
        props.wideMode ? 'min-h-0 flex-1' : 'min-h-72'
      )}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Info className="h-5 w-5" />
        </div>
        <div className="max-w-md">
          <p className="text-base font-medium text-foreground">没有可用的 GIF 模型</p>
          <p className="mt-2 text-sm text-muted-foreground">
            请先在设置中完成至少一个 image 系列的 4K 图片模型配置。banana 系列不支持这里需要的自定义分辨率，所以不会显示。
          </p>
        </div>
        <Button onClick={props.onConfigureApiKey}>打开设置</Button>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex flex-col rounded-xl border border-border bg-muted/50 shadow-md',
      props.wideMode && 'min-h-0 flex-1 overflow-hidden'
    )}>
      <div className={cn('flex min-h-0 flex-col', props.wideMode && 'flex-1')}>
        {/* 紧凑参考图上传区，对齐反推提示词 */}
        <div className="shrink-0 p-4 pb-2">
          <div
            onDrop={props.onDrop}
            onDragOver={props.onDragOver}
            onDragLeave={props.onDragLeave}
            className={cn(
              'relative overflow-hidden rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all',
              props.maxedOut
                ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground'
                : props.isDragOver
                  ? 'border-primary bg-primary/20'
                  : 'cursor-pointer border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10',
            )}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={props.uploading || props.maxedOut}
              onChange={props.onFileSelect}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              style={{ fontSize: 0 }}
            />
            <CloudUpload className={cn('mx-auto mb-1 h-5 w-5', props.isDragOver ? 'text-primary' : 'text-muted-foreground')} />
            <p className="text-sm font-medium">
              {props.uploading
                ? '读取中...'
                : props.maxedOut
                  ? `已达到 ${GIF_MAX_REF_IMAGES} 张参考图上限`
                  : props.isDragOver
                    ? '将参考图拖放到这里'
                    : '可选：拖放或粘贴参考图'}
            </p>
            <p className="text-xs text-muted-foreground">最多 {GIF_MAX_REF_IMAGES} 张 · 当前 {props.refFiles.length} 张</p>
          </div>
        </div>

        {props.refFiles.length > 0 && (
          <div className="shrink-0 px-4 pb-2">
            <AttachmentChips
              files={props.refFiles}
              onRemove={props.onRemoveRef}
              sourceKind="gif"
              sourceLabel="GIF 参考图"
              prompt={props.prompt}
            />
          </div>
        )}

        {/* 提示词输入：清晰边框，宽屏下吃掉剩余高度 */}
        <div className={cn('px-4 pb-3', props.wideMode && 'flex min-h-0 flex-1 flex-col')}>
          <div className={cn(
            'overflow-hidden rounded-xl border border-border bg-background shadow-xs transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15',
            props.wideMode && 'flex min-h-0 flex-1 flex-col'
          )}>
            <Textarea
              value={props.prompt}
              onChange={event => props.onPromptChange(event.target.value)}
              placeholder="描述动画主题 / 动作，例如：一只虎斑猫缓慢眨眼"
              rows={props.wideMode ? undefined : 5}
              className={cn(
                'resize-none rounded-none border-0 bg-transparent px-3 py-3 shadow-none placeholder:text-placeholder focus-visible:border-0 focus-visible:ring-0',
                props.wideMode ? 'h-full min-h-0 flex-1 [field-sizing:fixed]' : 'min-h-28'
              )}
            />
          </div>
        </div>

        {props.uploadError && (
          <div className="shrink-0 px-4 pb-3">
            <p className="text-sm text-destructive">{props.uploadError}</p>
          </div>
        )}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Popover open={props.modelPopoverOpen} onOpenChange={props.onModelPopoverOpenChange}>
            <PopoverTrigger
              className={cn(
                buttonVariants({ variant: 'outline', size: 'xs' }),
                'h-7 gap-1.5 border-primary/40 bg-primary/8 px-2 text-foreground shadow-xs hover:border-primary/60 hover:bg-primary/12'
              )}
              title="模型"
            >
              <span className="text-[11px] font-semibold text-primary">模型</span>
              <span className="h-3 w-px bg-primary/30" />
              <span className="max-w-40 truncate text-[12px] font-semibold">{formatModelLabel(props.model, props.modelOptions)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-primary" />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1.5" align="start">
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold tracking-wide text-primary">选择模型</p>
              {props.modelOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    props.onModelChange(option.value);
                    props.onModelPopoverOpenChange(false);
                  }}
                  className={cn(
                    'w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted',
                    props.model === option.value && 'bg-muted font-medium',
                  )}
                >
                  {option.label}
                </button>
              ))}
              <p className="px-2.5 py-1 text-[11px] text-muted-foreground">仅显示支持 4K 自定义分辨率的 image 系列模型，banana 系列不显示</p>
            </PopoverContent>
          </Popover>

          {supportsGptImageAdvancedParams(props.model) && (
            <GptImageAdvancedParamsControl
              model={props.model}
              value={props.gptImageAdvancedParams}
              onChange={props.onGptImageAdvancedParamsChange}
              variant="outline"
              size="xs"
            />
          )}

          <button
            type="button"
            onClick={() => props.onClosedLoopToggle(!props.closedLoop)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'xs' }),
              'h-7 gap-1',
              props.closedLoop ? 'border-primary/40 bg-primary/8 text-primary' : '',
            )}
            title="首尾闭合：驱使模型生成闭环动画，第12帧无缝衔接回第1帧"
          >
            <Link className="h-3 w-3" />
            <span className="text-[11px]">首尾帧闭合</span>
          </button>

          <div className="ml-auto flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={props.onOptimize}
              disabled={!props.canSubmit}
              title="优化提示词"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={props.onClear}
              disabled={!props.prompt.trim() && props.refFiles.length === 0}
              title="清空提示词和图片"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={props.onSubmit}
              disabled={!props.canSubmit}
              className="gap-1"
            >
              {props.generating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowUp className="h-4 w-4" />}
              <span>生成网格图</span>
            </Button>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          网格 3×4=12 帧 · 分辨率 3264×2448 · 仅 image 系列 4K 模型
        </p>
      </div>
    </div>
  );
}
