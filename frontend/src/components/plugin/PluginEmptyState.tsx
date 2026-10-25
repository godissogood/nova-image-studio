'use client';

import { AlertTriangle, PackageOpen } from 'lucide-react';
import type { PluginRegistrySnapshot } from '@/lib/plugin-registry-client';

/**
 * 一个视频插件都没装（或全部加载失败）时的说明。
 *
 * 开源版不内置任何上游协议，所以这是全新部署的默认状态——文案要直接告诉管理员
 * 该往哪个目录放什么，而不是一句「暂无数据」。
 */
export function PluginEmptyState({ registry }: { registry: PluginRegistrySnapshot }) {
  const hasFailures = registry.failures.length > 0;

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 sm:p-8">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <PackageOpen className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">还没有安装视频插件</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            视频能力由插件包提供，安装与卸载插件需要管理员在服务器上操作插件目录。重启后即可使用。
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-left">
          <p className="text-[11px] font-medium text-foreground">插件状态</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            视频能力由服务器端部署的插件提供。插件加载后会显示在这里。
          </p>
        </div>

        {hasFailures && (
          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-left">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="size-3.5" />
              有 {registry.failures.length} 个插件目录加载失败
            </p>
            {registry.failures.map(failure => (
              <div key={failure.id} className="space-y-0.5">
                <p className="font-mono text-[11px] text-foreground">{failure.id}</p>
                <p className="text-[11px] leading-relaxed text-destructive/90">{failure.error}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
