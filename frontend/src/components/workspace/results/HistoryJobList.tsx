'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Mode, StoredJob } from '@/lib/job-store';
import { cn } from '@/lib/utils';
import { getModelDisplayName } from '@/lib/model-capabilities';
import { CompletedJobCard } from '@/components/workspace/results/CompletedJobCard';

export type GenerationHistoryFilter = 'all' | 'text-to-image' | 'image-to-image';
export type HistoryClearScope = GenerationHistoryFilter;

const historyFilterOptions: { value: GenerationHistoryFilter; label: string }[] = [
  { value: 'all', label: '同时显示' },
  { value: 'text-to-image', label: '文生图' },
  { value: 'image-to-image', label: '图生图' },
];

function isWaitingJob(job: StoredJob): boolean {
  return job.status === 'processing' || job.status === 'queued' || job.status === '排队中';
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  return now;
}

const WaitingJobCard = memo(function WaitingJobCard({
  job,
  now,
  isChecking,
  cooldownEnd,
  onCancel,
  onCheckStatus,
}: {
  job: StoredJob;
  now: number;
  isChecking: boolean;
  cooldownEnd: number | undefined;
  onCancel: (jobId: string) => void;
  onCheckStatus: (job: StoredJob) => void;
}) {
  const parallelCount = job.parallelCount || 1;
  const statusText = job.status === 'queued' || job.status === '排队中'
    ? '排队中...'
    : job.mode === 'text-to-image'
      ? (parallelCount > 1 ? `生成中 (x${parallelCount})...` : '生成中...')
      : (parallelCount > 1 ? `转换中 (x${parallelCount})...` : '转换中...');
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(job.created_at)) / 1000));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base text-foreground">&quot;{job.prompt}&quot;</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{statusText}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            已用 <span className="font-mono text-foreground">{elapsedSeconds}</span> 秒 · {getModelDisplayName(job.model)}
          </p>
        </div>
        {job.serverTaskId && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCheckStatus(job)}
            disabled={isChecking || (cooldownEnd !== undefined && now < cooldownEnd)}
            title="查看进度"
          >
            {isChecking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCancel(job.id)}
          title="取消"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});

function JobsHeader({
  title,
  jobsList,
  hasAnyJobs,
  filter,
  onFilterChange,
  onClearAll,
  showPager,
  pageIndex,
  pageTotal,
  onPrev,
  onNext,
}: {
  title: string;
  jobsList: StoredJob[];
  hasAnyJobs: boolean;
  filter?: GenerationHistoryFilter;
  onFilterChange?: (filter: GenerationHistoryFilter) => void;
  onClearAll: () => void;
  showPager?: boolean;
  pageIndex: number;
  pageTotal: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!hasAnyJobs) return null;

  const completed = jobsList.filter(job => job.status === 'completed').length;
  const queued = jobsList.filter(job => job.status === 'queued' || job.status === '排队中').length;
  const processing = jobsList.filter(job => job.status === 'processing').length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1.5">
        <h3 className="itoo-section-title">{title}</h3>
        <p className="itoo-section-meta">
          共 {jobsList.length} 条 · 完成 {completed} · 处理中 {processing} · 排队 {queued}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filter && onFilterChange && (
          <div className="flex rounded-lg border border-border bg-background p-0.5">
            {historyFilterOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  'h-6 rounded-md px-2 text-xs transition-colors',
                  filter === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {showPager && pageTotal > 0 && (
          <div className="flex items-center gap-1 rounded-full border border-border bg-background p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full"
              disabled={pageIndex <= 0}
              onClick={onPrev}
              title="上一条任务"
              aria-label="上一条任务"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-14 px-1 text-center text-xs font-medium tabular-nums text-muted-foreground">
              {pageIndex + 1} / {pageTotal}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full"
              disabled={pageIndex >= pageTotal - 1}
              onClick={onNext}
              title="下一条任务"
              aria-label="下一条任务"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onClearAll} disabled={jobsList.length === 0}>
          清空记录
        </Button>
      </div>
    </div>
  );
}

function PagedJobView({
  jobs,
  active,
  wideMode,
  index,
  onIndexChange,
  renderJobCard,
}: {
  jobs: StoredJob[];
  active: boolean;
  wideMode: boolean;
  index: number;
  onIndexChange: (index: number) => void;
  renderJobCard: (job: StoredJob) => React.ReactNode;
}) {
  if (!active || jobs.length === 0) return null;

  const safeIndex = Math.min(Math.max(index, 0), jobs.length - 1);
  const job = jobs[safeIndex];

  return (
    <div
      className={cn('min-h-0', wideMode ? 'flex flex-1 flex-col' : undefined)}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onIndexChange(Math.max(0, safeIndex - 1));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onIndexChange(Math.min(jobs.length - 1, safeIndex + 1));
        }
      }}
      tabIndex={0}
      aria-label="生图任务翻页"
    >
      <div className={cn(
        'min-h-0',
        wideMode ? 'flex-1 overflow-y-auto overflow-x-hidden pr-1' : undefined
      )}>
        <div
          key={job.id}
          className="animate-in fade-in duration-200"
        >
          {renderJobCard(job)}
        </div>
      </div>

      {jobs.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="soft"
            size="sm"
            className="gap-1 rounded-full px-3"
            disabled={safeIndex <= 0}
            onClick={() => onIndexChange(safeIndex - 1)}
          >
            <ChevronLeft className="size-4" />
            上一条
          </Button>
          <span className="min-w-14 text-center text-xs font-medium tabular-nums text-muted-foreground">
            {safeIndex + 1} / {jobs.length}
          </span>
          <Button
            type="button"
            variant="soft"
            size="sm"
            className="gap-1 rounded-full px-3"
            disabled={safeIndex >= jobs.length - 1}
            onClick={() => onIndexChange(safeIndex + 1)}
          >
            下一条
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface HistoryJobListProps {
  active: boolean;
  wideMode?: boolean;
  title: string;
  mode: Mode;
  historyFilter?: GenerationHistoryFilter;
  hasAnyJobs?: boolean;
  emptyDescription?: string;
  jobs: StoredJob[];
  loadedImages: Set<string>;
  checkingJobIds: Set<string>;
  cooldowns: Map<string, number>;
  /** 左右翻页展示；默认关闭，恢复纵向列表 */
  paged?: boolean;
  onRetry: (job: StoredJob) => void;
  onRetryDownload?: (job: StoredJob) => void | Promise<void>;
  onClear: (jobId: string) => void;
  onClearAll: (scope: HistoryClearScope) => void;
  onHistoryFilterChange?: (filter: GenerationHistoryFilter) => void;
  onCancel: (jobId: string) => void;
  onCheckStatus: (job: StoredJob) => void;
}

export function HistoryJobList({
  active,
  wideMode = false,
  title,
  mode,
  historyFilter,
  hasAnyJobs,
  emptyDescription,
  jobs,
  loadedImages,
  checkingJobIds,
  cooldowns,
  paged = false,
  onRetry,
  onRetryDownload,
  onClear,
  onClearAll,
  onHistoryFilterChange,
  onCancel,
  onCheckStatus,
}: HistoryJobListProps) {
  const hasActiveTimers = useMemo(() => active && jobs.some(job => isWaitingJob(job)), [active, jobs]);
  const now = useNow(hasActiveTimers);
  const clearScope: HistoryClearScope = historyFilter || (mode === 'image-to-image' ? 'image-to-image' : 'text-to-image');
  const [pageIndex, setPageIndex] = useState(0);
  const renderJobCard = (job: StoredJob) => {
    const hasImage = job.status === 'completed' && (job.images || job.imageData) && loadedImages.has(job.id);
    if (isWaitingJob(job)) {
      return <WaitingJobCard job={job} now={now} isChecking={checkingJobIds.has(job.id)} cooldownEnd={cooldowns.get(job.id)} onCancel={onCancel} onCheckStatus={onCheckStatus} />;
    }
    if (hasImage) {
      return <CompletedJobCard job={job} onClear={() => onClear(job.id)} onRetry={onRetry} onRetryDownload={onRetryDownload} />;
    }
    if (job.status === 'failed') {
      const allowCheckStatus = !job.terminal && !!job.serverTaskId;
      return (
        <div className="rounded-xl border border-destructive/20 bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-base text-foreground">&quot;{job.prompt}&quot;</p>
              <p className="max-h-20 overflow-y-auto text-sm text-destructive">{job.error || '任务失败'}</p>
              <p className="text-xs text-muted-foreground">{getModelDisplayName(job.model)}</p>
            </div>
            <div className="flex gap-1">
              {allowCheckStatus && (
                <Button variant="ghost" size="icon-sm" onClick={() => onCheckStatus(job)} disabled={checkingJobIds.has(job.id) || (cooldowns.get(job.id) !== undefined && now < cooldowns.get(job.id)!)} title="查看进度">
                  {checkingJobIds.has(job.id)
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => onRetry(job)} title="重试">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onClear(job.id)} title="删除">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section className={cn(wideMode ? 'flex h-full min-h-0 flex-col space-y-4' : 'space-y-3')}>
      <JobsHeader
        title={title}
        jobsList={jobs}
        hasAnyJobs={hasAnyJobs ?? jobs.length > 0}
        filter={historyFilter}
        onFilterChange={onHistoryFilterChange}
        onClearAll={() => onClearAll(clearScope)}
        showPager={paged}
        pageIndex={pageIndex}
        pageTotal={jobs.length}
        onPrev={() => setPageIndex(index => Math.max(0, index - 1))}
        onNext={() => setPageIndex(index => Math.min(jobs.length - 1, index + 1))}
      />
      {active && jobs.length === 0 ? (
        <div className={cn(
          'flex flex-col items-center justify-center text-center',
          wideMode ? 'flex-1 py-16' : 'py-8'
        )}>
          <p className="itoo-empty-title">暂无记录</p>
          <p className="itoo-empty-desc mt-2">
            {emptyDescription || (mode === 'text-to-image' ? '提交一段文字描述来生成图片' : '上传图片并输入描述来转换')}
          </p>
        </div>
      ) : paged ? (
        <PagedJobView
          jobs={jobs}
          active={active}
          wideMode={wideMode}
          index={pageIndex}
          onIndexChange={setPageIndex}
          renderJobCard={renderJobCard}
        />
      ) : (
        <div className={cn('space-y-4', wideMode && 'min-h-0 flex-1 overflow-y-auto')}>
          {jobs.map(job => (
            <div key={job.id}>{renderJobCard(job)}</div>
          ))}
        </div>
      )}
    </section>
  );
}
