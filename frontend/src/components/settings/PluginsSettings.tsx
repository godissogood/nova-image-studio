'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Eye, EyeOff, Package, RotateCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import { cn } from '@/lib/utils';
import {
  getCredentialVersion,
  getPluginCredential,
  getPluginRegistryServerSnapshot,
  getPluginRegistrySnapshot,
  loadPluginRegistry,
  setPluginCredential,
  subscribePluginCredentials,
  subscribePluginRegistry,
} from '@/lib/plugin-registry-client';
import type { InstalledPlugin } from '@/lib/plugin-schema';
import { fetchModelIds } from '@/lib/model-id-client';
import { ITOO_API_BASE_URL } from '@/lib/itoo-config';
import { Toast, type ToastData } from '@/components/workspace/Toast';

/**
 * 设置 → 插件。
 *
 * 这一页是只读的清单：装、删、改插件包都要管理员上服务器操作插件目录，
 * 前端提供安装入口只会给出一条巨大的任意文件写入面。唯一可编辑的是凭据，
 * 因为凭据属于用户而不属于部署——和开源版图片模型「每个模型各存一份 key」一致。
 */
export function PluginsSettings() {
  const registry = useSyncExternalStore(
    subscribePluginRegistry,
    getPluginRegistrySnapshot,
    getPluginRegistryServerSnapshot,
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadPluginRegistry();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadPluginRegistry(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SettingsSectionHeading
          title="已安装的视频插件"
          description="视频能力由插件包提供，安装与卸载插件需要管理员在服务器上操作插件目录。"
          action={(
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="min-h-10 rounded-lg px-3 text-sm"
          >
            <RotateCw className={cn('mr-2 size-4', refreshing && 'animate-spin')} />
            重新读取
          </Button>
          )}
        />
      </div>

      {registry.plugins.length === 0 && registry.failures.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <Package className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">还没有安装任何插件</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            部署插件后点击“重新读取”，即可刷新已安装插件列表。
            开发方式见仓库中的 <code className="font-mono">docs/plugins/</code>。
          </p>
        </div>
      )}

      <div className="space-y-3">
        {registry.plugins.map(plugin => (
          <PluginCard key={plugin.id} plugin={plugin} />
        ))}
      </div>

      {registry.failures.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-base font-semibold text-destructive">
            <AlertTriangle className="size-4" />
            加载失败的插件目录（{registry.failures.length}）
          </h4>
          {registry.failures.map(failure => (
            <div key={failure.id} className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
              <p className="font-mono text-xs text-foreground">{failure.id}</p>
              <p className="text-sm leading-6 text-destructive/90">{failure.error}</p>
            </div>
          ))}
          <p className="text-sm leading-6 text-muted-foreground">
            校验错误会精确到具体字段，按提示改完对应的 JSON 后重启后端即可。
          </p>
        </div>
      )}
    </div>
  );
}

function PluginCard({ plugin }: { plugin: InstalledPlugin }) {
  const credentialVersion = useSyncExternalStore(
    subscribePluginCredentials,
    getCredentialVersion,
    () => 0,
  );
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastIdRef = useRef(0);
  // 直接以 store 为唯一数据源，不另存一份草稿：草稿要用 effect 回填，
  // 而那会在另一个标签页改凭据时打断正在输入的内容。
  const credential = useMemo(
    () => getPluginCredential(plugin),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- credentialVersion 是外部 store 的变更信号
    [plugin, credentialVersion],
  );
  const isPinnedRelay = plugin.id === 'grok-video';

  const showToast = (message: string, type: ToastData['type']) => {
    setToast({ id: `plugin-toast-${++toastIdRef.current}`, message, type });
  };
  const dismissToast = (id: string) => {
    setToast(current => current?.id === id ? null : current);
  };

  const saveAndCheck = async () => {
    const apiKey = credential.apiKey.trim();
    if (!apiKey) {
      showToast('请先填写 API Key。', 'error');
      return;
    }
    setChecking(true);
    const saved = setPluginCredential(plugin.id, {
      apiKey,
      ...(isPinnedRelay ? { baseUrl: ITOO_API_BASE_URL } : {}),
    });
    if (!saved) {
      setChecking(false);
      showToast('保存凭据失败，请检查浏览器存储空间后重试。', 'error');
      return;
    }
    try {
      const models = await fetchModelIds({ apiKey, protocol: 'grok' });
      if (models.length === 0) {
        showToast('连接失败，API Key 未返回可用模型。', 'error');
      } else {
        showToast(`连接成功，API Key 可读取 ${models.length} 个模型。`, 'success');
      }
    } catch {
      showToast('连接失败，请检查 API Key 是否有效并确认支持 Grok 模型。', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            <span
              className={cn(
                'inline-flex size-2 rounded-full',
                credential.apiKey ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              aria-hidden
            />
            {plugin.name}
            <span className="font-mono text-xs font-normal text-muted-foreground">v{plugin.version}</span>
            {!credential.apiKey && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                待填写凭据
              </span>
            )}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">{plugin.description}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs leading-5 text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5 font-mono">{plugin.id}</span>
            <span>{plugin.models.length} 个模型</span>
            {plugin.author && <span>· {plugin.author}</span>}
            {plugin.homepage && (
              <a
                href={plugin.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                主页
              </a>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Base URL</span>
          <Input
            type="text"
            value={credential.baseUrl}
            readOnly={isPinnedRelay}
            aria-readonly={isPinnedRelay}
            placeholder={plugin.credential.defaultBaseUrl || 'https://...'}
            onChange={event => setPluginCredential(plugin.id, { baseUrl: event.target.value })}
            className={cn('h-10 rounded-lg text-sm', isPinnedRelay && 'bg-muted/60 text-muted-foreground')}
          />
        </label>

        <label className="space-y-2">
          <span className="flex min-h-5 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">{isPinnedRelay ? 'API Key' : plugin.credential.label}</span>
            {isPinnedRelay && <span className="text-xs font-normal text-muted-foreground">支持 Grok 模型的 API</span>}
          </span>
          <span className="relative block">
            <Input
              type={showKey ? 'text' : 'password'}
              value={credential.apiKey}
              placeholder="填写后即可在视频工作台提交任务"
              autoComplete="off"
              onChange={event => setPluginCredential(plugin.id, { apiKey: event.target.value })}
              className="h-10 rounded-lg pr-9 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(prev => !prev)}
              aria-label={showKey ? '隐藏密钥' : '显示密钥'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        凭据只保存在当前浏览器，不会写入服务器数据库；提交任务时随请求转发，服务端仅用于调用该插件
        在 <code className="font-mono">manifest.permissions.hosts</code> 里申报过的主机。
      </p>

      <div className="flex justify-end">
        <Button onClick={() => void saveAndCheck()} disabled={checking} className="min-h-10 gap-2">
          {checking ? <RotateCw className="size-4 animate-spin" /> : <Save className="size-4" />}
          {checking ? '检查中...' : '保存并检查'}
        </Button>
      </div>
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
