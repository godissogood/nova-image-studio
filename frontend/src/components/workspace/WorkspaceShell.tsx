'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ImageGenerationWorkbench } from '@/components/ImageGenerationWorkbench';
import { PluginWorkbench } from '@/components/plugin/PluginWorkbench';
import { PluginHistoryList } from '@/components/plugin/PluginHistoryList';
import { ReversePromptForm } from '@/components/ReversePromptForm';
import { GifGenerationWorkspace } from '@/components/GifGenerationWorkspace';
import { AgentChatWorkspace } from '@/components/agent/AgentChatWorkspace';
import { SessionSwitcher } from '@/components/agent/SessionSwitcher';
import { AssetsWorkspace } from '@/components/assets/AssetsWorkspace';
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace';
import { SliceWorkspace } from '@/components/slice/SliceWorkspace';
import { PromptGallery } from '@/components/PromptGallery';
import { SettingsModal, type SettingsTab } from '@/components/SettingsModal';
import { MissingApiKeyDialog } from '@/components/MissingApiKeyDialog';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { useResponsiveWorkspaceLayout } from '@/hooks/useResponsiveWorkspaceLayout';
import { useServerTaskPolling } from '@/hooks/useServerTaskPolling';
import { useWorkspaceJobs } from '@/hooks/useWorkspaceJobs';
import { WorkspaceHeader, type WorkspaceHeaderRef } from '@/components/workspace/WorkspaceHeader';
import { WorkspaceModeTabs } from '@/components/workspace/WorkspaceModeTabs';
import { HistoryJobList, type GenerationHistoryFilter, type HistoryClearScope } from '@/components/workspace/results/HistoryJobList';
import { PromptGalleryAccessDialog, usePromptGalleryAccess } from '@/components/workspace/PromptGalleryAccess';
import { usePromptGalleryConfig } from '@/hooks/usePromptGalleryConfig';
import { ConfirmDialog } from '@/components/workspace/dialogs/ConfirmDialog';
import { Toast, type ToastData } from '@/components/workspace/Toast';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Settings } from 'lucide-react';
import { getNovaTask } from '@/lib/ccode-task-client';
import { finalizeCompletedServerTask } from '@/lib/workspace-task-service';
import { classifyTaskFailure } from '@/lib/task-failure';
import type { RefImageData, StoredJob } from '@/lib/job-store';
import type { PluginJob } from '@/lib/plugin-job-store';
import { subscribeImageActionToasts, subscribeUseAsImageReference } from '@/lib/image-actions';
import {
  submitImageToImage,
  submitTextToImage,
  type SubmitActions,
} from '@/lib/workspace-task-service';
import { cn } from '@/lib/utils';
import { getActiveAgentSessionId, setActiveAgentSessionId } from '@/lib/agent-sessions';
import { setAgentSession } from '@/lib/agent-context-store';

const PAGE_HERO: Record<string, { title: string; description: string }> = {
  'image-generation': {
    title: '图片创作',
    description: '用文字或参考图生成高质量图像，支持批量与多模型切换。',
  },
  agent: {
    title: 'AI 对话',
    description: '和助手聊聊你的想法，确认方案后再开始生成。',
  },
  'video-generation': {
    title: '视频创作',
    description: '用插件工作台完成视频生成、参数复用与历史管理。',
  },
  canvas: {
    title: '无限画布',
    description: '节点式画布生图 · 连线引用 · 生成走任务队列',
  },
  'image-to-slice': {
    title: 'UI设计模式',
    description: 'AI 拆解 UI 图为切图资产 · 手动校准 · 网页复刻',
  },
  assets: {
    title: '我的素材',
    description: '集中管理图片与提示词素材，随时复用到各工作台。',
  },
  'reverse-prompt': {
    title: '反推提示词',
    description: '从图片反推可用提示词，快速迁移风格与构图。',
  },
  gif: {
    title: '动图生成',
    description: '把静态画面做成动图，并调节帧与导出参数。',
  },
  'prompt-gallery': {
    title: '提示词广场',
    description: '浏览精选提示词，一键带入创作流程。',
  },
};

export function WorkspaceShell() {
  const queueStatus = useQueueStatus();
  const { desktopLayout: wideMode } = useResponsiveWorkspaceLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 设置弹层打开时停在哪一页。插件凭据的提示条要直达插件页，其余入口都回到模型配置。 */
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models');
  const openSettings = useCallback((tab: SettingsTab = 'models') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);
  const [missingApiKeyDialogOpen, setMissingApiKeyDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'image-generation' | 'video-generation' | 'agent' | 'canvas' | 'image-to-slice' | 'assets' | 'reverse-prompt' | 'gif' | 'prompt-gallery'>('agent');
  const [videoInitialJob, setVideoInitialJob] = useState<PluginJob | null>(null);
  const [generationHistoryFilter, setGenerationHistoryFilter] = useState<GenerationHistoryFilter>('all');
  const [generationClearScope, setGenerationClearScope] = useState<HistoryClearScope | null>(null);
  const [referenceDraft, setReferenceDraft] = useState<{ id: number; refImages: RefImageData[]; prompt?: string } | null>(null);
  const workspace = useWorkspaceJobs();
  const galleryConfig = usePromptGalleryConfig();
  const promptGallery = usePromptGalleryAccess(galleryConfig.mode, galleryConfig.passwordEnabled, setError, () => setActiveTab('prompt-gallery'));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [agentSidebarOpen, setAgentSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sessionId = getActiveAgentSessionId();

    void Promise.resolve(setAgentSession(sessionId)).then(() => {
      if (!cancelled) setActiveSessionId(sessionId);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAgentSessionChange = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === activeSessionId) return;
    await setAgentSession(sessionId);
    setActiveAgentSessionId(sessionId);
    setActiveSessionId(sessionId);
  }, [activeSessionId]);

  // Toast state
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastIdRef = useRef(0);
  const headerRef = useRef<WorkspaceHeaderRef>(null);
  const referenceDraftIdRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastData['type']) => {
    const id = `toast-${++toastIdRef.current}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => subscribeImageActionToasts(detail => showToast(detail.message, detail.type)), [showToast]);

  useEffect(() => subscribeUseAsImageReference(detail => {
    workspace.setRetryData(null);
    setReferenceDraft({ id: ++referenceDraftIdRef.current, refImages: detail.refImages, prompt: detail.prompt });
    setActiveTab('image-generation');
  }), [workspace]);

  const handleImageDraftConsumed = useCallback(() => {
    workspace.setRetryData(null);
    setReferenceDraft(null);
  }, [workspace]);

  // Checking debounce state
  const [checkingJobIds, setCheckingJobIds] = useState<Set<string>>(new Set());
  // Cooldown state: jobId -> cooldown end timestamp
  const [cooldowns, setCooldowns] = useState<Map<string, number>>(new Map());

  const submitActions = useMemo<SubmitActions>(() => ({
    addJob: workspace.addJob,
    replaceJob: workspace.replaceJob,
    completeJob: workspace.completeJob,
    failJob: workspace.failJob,
    getJob: workspace.getJob,
  }), [workspace.addJob, workspace.completeJob, workspace.failJob, workspace.replaceJob, workspace.getJob]);

  useServerTaskPolling(workspace.jobs, submitActions, workspace.hasJob);

  const handleSubmitError = useCallback((message: string) => {
    if (message === '请先配置 API 密钥') {
      setError(null);
      setMissingApiKeyDialogOpen(true);
      return;
    }
    showToast(message, 'error');
  }, [showToast]);

  const handleCheckStatus = useCallback(async (job: StoredJob) => {
    if (!job.serverTaskId || checkingJobIds.has(job.id) || cooldowns.has(job.id)) return;
    setCheckingJobIds(prev => new Set(prev).add(job.id));
    // Set 5s cooldown
    setCooldowns(prev => new Map(prev).set(job.id, Date.now() + 5000));
    try {
      const task = await getNovaTask(job.serverTaskId);
      if (task.status === 'completed') {
        showToast('生成完成，正在下载图片…', 'success');
        await finalizeCompletedServerTask(job, task, submitActions);
      } else if (task.status === 'failed' || task.status === 'expired') {
        const { terminal } = classifyTaskFailure(task);
        const message = task.error || task.warning
          || (task.status === 'expired' ? '该任务已超出取回时间' : '任务失败');
        void submitActions.failJob(job.id, message, { terminal });
        showToast(`任务失败：${message}`, 'error');
      } else if (task.status === 'processing') {
        submitActions.replaceJob(job.id, cur => ({ ...cur, status: 'processing' }));
        showToast('任务正在生成中，请稍候…', 'info');
      } else if (task.status === 'queued' || task.status === '排队中') {
        submitActions.replaceJob(job.id, cur => ({ ...cur, status: '排队中' }));
        showToast('任务排队中，请耐心等待…', 'info');
      }
    } catch {
      showToast('查询失败，请稍后重试', 'error');
    } finally {
      setCheckingJobIds(prev => { const next = new Set(prev); next.delete(job.id); return next; });
      // Cleanup cooldown after 5s
      setTimeout(() => {
        setCooldowns(prev => {
          const next = new Map(prev);
          next.delete(job.id);
          return next;
        });
      }, 5000);
    }
  }, [checkingJobIds, cooldowns, submitActions, showToast]);

  const generationInitialData = useMemo(() => (
    workspace.retryData
      ? {
        prompt: workspace.retryData.prompt,
        outputSize: workspace.retryData.outputSize,
        customSize: workspace.retryData.customSize,
        aspectRatio: workspace.retryData.aspectRatio,
        temperature: workspace.retryData.temperature,
        model: workspace.retryData.model,
        gptImageQuality: workspace.retryData.gptImageQuality,
        gptImageStyle: workspace.retryData.gptImageStyle,
        gptImageBackground: workspace.retryData.gptImageBackground,
        parallelCount: workspace.retryData.parallelCount,
        refImages: workspace.retryData.refImages,
      }
      : undefined
  ), [workspace.retryData]);

  const generationJobs = useMemo(
    () => [...workspace.textJobs, ...workspace.imageJobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [workspace.imageJobs, workspace.textJobs]
  );
  const filteredGenerationJobs = useMemo(
    () => generationHistoryFilter === 'all'
      ? generationJobs
      : generationJobs.filter(job => job.mode === generationHistoryFilter),
    [generationHistoryFilter, generationJobs]
  );
  const generationEmptyDescription = generationHistoryFilter === 'text-to-image'
    ? '提交一段文字描述来生成图片'
    : generationHistoryFilter === 'image-to-image'
      ? '添加参考图并输入描述来转换'
      : '输入提示词，或添加参考图后再生成';
  const clearScopeLabel = generationClearScope === 'all'
    ? '文生图和图生图'
    : generationClearScope === 'text-to-image'
      ? '文生图'
      : generationClearScope === 'image-to-image'
        ? '图生图'
        : '当前模式';

  const pageHero = PAGE_HERO[activeTab] ?? PAGE_HERO['image-generation'];

  const handleConfirmClearGeneration = useCallback(() => {
    if (!generationClearScope) return;
    const scope = generationClearScope;
    setGenerationClearScope(null);
    if (scope === 'all') {
      void Promise.all([
        workspace.clearJobsByMode('text-to-image'),
        workspace.clearJobsByMode('image-to-image'),
      ]);
      return;
    }
    if (scope === 'text-to-image' || scope === 'image-to-image') {
      void workspace.clearJobsByMode(scope);
    }
  }, [generationClearScope, workspace]);

  return (
    <div
      className={cn(
        'itoo-app-shell flex w-full flex-col overflow-x-hidden transition-[max-width] duration-200',
        wideMode
          ? 'min-h-dvh max-w-none'
          : 'mx-auto min-h-dvh max-w-5xl gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5 lg:px-8',
      )}
    >
      <div className={cn(
        'itoo-app-frame flex min-h-0 flex-1 flex-col',
        !wideMode && activeTab === 'agent' && 'min-h-0'
      )}>
        <div className={cn(
          'itoo-app-body min-h-0',
          wideMode
            ? 'flex flex-1 flex-col'
            : activeTab === 'agent'
              ? 'flex flex-1 flex-col gap-4'
              : 'space-y-4'
        )}>
          <WorkspaceHeader
            ref={headerRef}
            queueStatus={queueStatus}
            onOpenSettings={() => openSettings()}
            onLogoClick={promptGallery.handlePromptGalleryEntry}
            sidebarMode={wideMode}
          />

          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as typeof activeTab)}
            orientation={wideMode ? 'vertical' : 'horizontal'}
            className={cn(
              'itoo-workspace-tabs',
              wideMode
                ? 'flex flex-1 min-h-0 flex-col gap-3 xl:flex-row xl:gap-4'
                : activeTab === 'agent'
                  ? 'gap-2 flex flex-col flex-1 min-h-0'
                  : 'gap-2'
            )}
          >
            <aside className={cn(
              'itoo-workspace-nav flex min-h-0 flex-col',
              wideMode && 'itoo-workspace-nav-fixed self-stretch xl:h-full xl:shrink-0 xl:overflow-hidden'
            )}>
              {wideMode && (
                <button
                  type="button"
                  onClick={promptGallery.handlePromptGalleryEntry}
                  className="itoo-brand-block flex w-full items-center rounded-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="iToo Image logo"
                >
                  <img
                    src="/favicon.png"
                        alt="iToo Image"
                    className="shrink-0 object-cover ring-1 ring-border/70"
                  />
                  <div className="min-w-0">
                      <h2 className="itoo-title-brand truncate">iToo Image</h2>
                    <p className="itoo-subtitle mt-0.5 truncate">创作中心</p>
                  </div>
                </button>
              )}
              <div className={cn(wideMode ? 'flex min-h-0 flex-1 flex-col overflow-y-auto py-1' : 'flex flex-col py-1')}>
                <WorkspaceModeTabs wideMode={wideMode} showPromptGallery={promptGallery.showPromptGallery} activeTab={activeTab} />
              </div>

              {wideMode && (
                <div className="itoo-sidebar-tools mt-auto hidden flex-col xl:flex">
                  <div className="itoo-sidebar-tools-label">快捷操作</div>
                  <div className="itoo-sidebar-actions">
                    <ThemeToggle emphasize />
                    <button
                      type="button"
                      className="itoo-sidebar-action itoo-sidebar-action-settings"
                      onClick={() => openSettings()}
                    >
                      <span className="itoo-sidebar-action-icon" aria-hidden>
                        <Settings className="size-3.5" />
                      </span>
                      <span>设置</span>
                    </button>
                  </div>

                  <div className="itoo-sidebar-queue">
                    {queueStatus ? (
                      <>
                        <div className="itoo-sidebar-queue-row">
                          <span>并发 {queueStatus.processingCount}</span>
                          <span className={cn(
                            typeof queueStatus.queuedCount === 'number' && typeof queueStatus.maxQueueSize === 'number' && queueStatus.queuedCount >= queueStatus.maxQueueSize
                              ? 'text-destructive'
                              : undefined
                          )}>
                            排队 {queueStatus.queuedCount}{typeof queueStatus.maxQueueSize === 'number' ? ` / ${queueStatus.maxQueueSize}` : ''}
                          </span>
                        </div>
                        <div className="itoo-sidebar-queue-status">
                          状态 {queueStatus.acceptingNewTasks ? '开启' : '关闭'}
                        </div>
                        {queueStatus.serverMessage && (
                          <span className="itoo-sidebar-queue-alert">{queueStatus.serverMessage}</span>
                        )}
                      </>
                    ) : (
                      <span>排队状态未知</span>
                    )}
                  </div>
                </div>
              )}
            </aside>

            <div className={cn(
              'itoo-workspace-content',
              wideMode && 'itoo-main-stage xl:min-w-0',
              !wideMode && activeTab === 'agent' && 'flex flex-1 flex-col min-h-0'
            )}>
              <div className={cn(
                activeTab === 'agent' && 'flex min-h-0 flex-1 flex-col bg-transparent',
                wideMode && activeTab !== 'agent' && 'itoo-main-card',
                wideMode && (activeTab === 'image-generation' || activeTab === 'canvas' || activeTab === 'image-to-slice' || activeTab === 'reverse-prompt' || activeTab === 'gif') && 'overflow-hidden',
                wideMode && activeTab !== 'agent' && activeTab !== 'image-generation' && activeTab !== 'canvas' && activeTab !== 'image-to-slice' && activeTab !== 'reverse-prompt' && activeTab !== 'gif' && 'overflow-y-auto overflow-x-hidden'
              )}>
                {activeTab !== 'agent' && (
                  <header className={cn(
                    'itoo-page-hero',
                    !wideMode && 'itoo-page-hero-compact',
                    (activeTab === 'canvas' || activeTab === 'image-to-slice' || activeTab === 'reverse-prompt' || activeTab === 'gif') && 'shrink-0'
                  )}>
                    <h2 className="itoo-page-title">{pageHero.title}</h2>
                    <span className="itoo-page-separator" aria-hidden="true">—</span>
                    <p className="itoo-page-desc">{pageHero.description}</p>
                  </header>
                )}

              <TabsContent value="image-generation" keepMounted className={cn(
                wideMode
                  ? 'flex min-h-0 flex-1 flex-col px-4 pb-4'
                  : 'space-y-3'
              )}>
                <div className={cn(
                  wideMode
                    ? 'grid min-h-0 flex-1 items-stretch gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.35fr)]'
                    : 'space-y-3'
                )}>
                  <div className={cn(wideMode && 'flex min-h-0 h-full flex-col')}>
                    <ImageGenerationWorkbench
                      wideMode={wideMode}
                      onSubmitText={data => void submitTextToImage(data, submitActions, handleSubmitError)}
                      onSubmitImage={data => void submitImageToImage(data, submitActions, handleSubmitError)}
                      disabled={!workspace.hasApiKey}
                      onConfigureApiKey={() => openSettings()}
                      onDraftConsumed={handleImageDraftConsumed}
                      initialData={generationInitialData}
                      referenceDraft={referenceDraft}
                    />
                  </div>
                  <HistoryJobList
                    wideMode={wideMode}
                    active={activeTab === 'image-generation'}
                    title="生图任务"
                    mode="text-to-image"
                    historyFilter={generationHistoryFilter}
                    onHistoryFilterChange={setGenerationHistoryFilter}
                    hasAnyJobs={generationJobs.length > 0}
                    emptyDescription={generationEmptyDescription}
                    jobs={filteredGenerationJobs}
                    loadedImages={workspace.loadedImages}
                    checkingJobIds={checkingJobIds}
                    cooldowns={cooldowns}
                    onRetry={job => {
                      workspace.retryJob(job);
                      setActiveTab('image-generation');
                    }}
                    onRetryDownload={workspace.retryDownload}
                    onClear={jobId => void workspace.removeJob(jobId)}
                    onClearAll={scope => setGenerationClearScope(scope)}
                    onCancel={jobId => workspace.setCancelJobId(jobId)}
                    onCheckStatus={handleCheckStatus}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="agent"
                keepMounted
                className={cn(
                  'flex min-h-0 flex-1 flex-col',
                  wideMode && 'xl:min-h-0'
                )}
              >
                {activeSessionId && (
                  <div className={cn(
                    'flex min-h-0 flex-1',
                    wideMode ? 'itoo-agent-stage' : 'gap-3'
                  )}>
                    <SessionSwitcher
                      activeSessionId={activeSessionId}
                      onSessionChange={handleAgentSessionChange}
                      mobileOpen={agentSidebarOpen}
                      onMobileOpenChange={setAgentSidebarOpen}
                    />
                    <AgentChatWorkspace
                      key={activeSessionId}
                      activeSessionId={activeSessionId}
                      wideMode={wideMode}
                      disabled={!workspace.hasApiKey}
                      onConfigureApiKey={() => openSettings()}
                      onToggleSidebar={() => setAgentSidebarOpen(prev => !prev)}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="video-generation" keepMounted className={cn(wideMode ? 'space-y-6 px-4 pb-4 xl:flex xl:min-h-0 xl:flex-1 xl:space-y-0' : 'space-y-3')}>
                <div className={cn(wideMode ? 'grid items-start gap-5 xl:h-full xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(460px,0.95fr)_minmax(0,1.35fr)] xl:items-stretch' : 'space-y-3')}>
                  <div className={cn(wideMode && 'xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1')}>
                    <PluginWorkbench
                      wideMode={wideMode}
                      onConfigureCredential={() => openSettings('plugins')}
                      showToast={showToast}
                      initialJob={videoInitialJob}
                    />
                  </div>
                  <PluginHistoryList
                    wideMode={wideMode}
                    active={activeTab === 'video-generation'}
                    showToast={showToast}
                    onReuseParams={job => {
                      setVideoInitialJob(job);
                      setActiveTab('video-generation');
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="canvas" keepMounted className={cn('min-h-0', wideMode ? 'flex min-h-0 flex-1 flex-col px-4 pb-3' : 'space-y-4')}>
                <CanvasWorkspace
                  wideMode={wideMode}
                  onConfigureApiKey={() => openSettings()}
                  showToast={showToast}
                  showPromptGallery={promptGallery.showPromptGallery}
                />
              </TabsContent>

              <TabsContent value="image-to-slice" keepMounted className={cn('min-h-0', wideMode ? 'flex min-h-0 flex-1 flex-col px-4 pb-3' : 'space-y-4')}>
                <SliceWorkspace
                  wideMode={wideMode}
                  onConfigureApiKey={() => openSettings()}
                  showToast={showToast}
                />
              </TabsContent>

              <TabsContent value="assets" keepMounted className={cn(wideMode ? 'space-y-6 px-4 pb-4 xl:min-h-0 xl:min-w-0 xl:flex xl:flex-1 xl:flex-col' : 'space-y-6')}>
                <AssetsWorkspace wideMode={wideMode} active={activeTab === 'assets'} />
              </TabsContent>

              <TabsContent value="reverse-prompt" keepMounted className={cn(
                wideMode
                  ? 'flex min-h-0 flex-1 flex-col px-4 pb-4'
                  : 'space-y-3'
              )}>
                <ReversePromptForm
                  wideMode={wideMode}
                  disabled={!workspace.hasApiKey}
                  onConfigureApiKey={() => openSettings()}
                />
              </TabsContent>

              <TabsContent value="gif" keepMounted className={cn(
                wideMode
                  ? 'flex min-h-0 flex-1 flex-col px-4 pb-4'
                  : 'space-y-3'
              )}>
                <GifGenerationWorkspace
                  wideMode={wideMode}
                  hasApiKey={workspace.hasApiKey}
                  onConfigureApiKey={() => openSettings()}
                  onError={message => showToast(message, 'error')}
                  showToast={showToast}
                />
              </TabsContent>

              {promptGallery.showPromptGallery && (
                <TabsContent value="prompt-gallery" keepMounted className={cn(wideMode && 'px-4 pb-4')}>
                  <div className={cn('bg-transparent p-0 shadow-none', wideMode ? 'sm:p-0' : 'sm:rounded-2xl sm:bg-card sm:p-4 sm:shadow-sm sm:border sm:border-border')}>
                    <PromptGallery wideMode={wideMode} />
                  </div>
                </TabsContent>
              )}
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onApiKeyChange={workspace.setHasApiKey}
        initialTab={settingsTab}
      />

      <MissingApiKeyDialog
        open={missingApiKeyDialogOpen}
        onOpenChange={setMissingApiKeyDialogOpen}
        onConfigure={() => openSettings()}
      />

      <PromptGalleryAccessDialog
        open={promptGallery.passwordDialogOpen}
        passwordInput={promptGallery.passwordInput}
        onPasswordChange={promptGallery.setPasswordInput}
        onClose={() => promptGallery.setPasswordDialogOpen(false)}
        onSubmit={() => void promptGallery.handlePasswordSubmit()}
      />

      {workspace.cancelJobId && createPortal(
        <ConfirmDialog
          title="取消生成任务"
          message={
            <>
              取消后会删除本地任务记录并停止前端等待流程。
              <span className="mt-1 block text-warning">如果任务已进入服务端队列，可能仍会继续执行。</span>
            </>
          }
          confirmText="取消并删除"
          onConfirm={() => {
            const jobId = workspace.cancelJobId;
            workspace.setCancelJobId(null);
            if (jobId) {
              void workspace.removeJob(jobId);
            }
          }}
          onCancel={() => workspace.setCancelJobId(null)}
        />,
        document.body
      )}

      {generationClearScope && createPortal(
        <ConfirmDialog
          title="清空记录"
          message={`确定要清空${clearScopeLabel}历史记录吗？此操作无法撤销。`}
          confirmText="清空"
          onConfirm={handleConfirmClearGeneration}
          onCancel={() => setGenerationClearScope(null)}
        />,
        document.body
      )}

      {error && createPortal(
        <div className="fixed bottom-4 right-4 z-[10000] max-w-sm rounded-xl border border-destructive/20 bg-card px-4 py-3 text-sm text-destructive shadow-lg">
          {error}
        </div>,
        document.body
      )}

      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
