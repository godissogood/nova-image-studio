'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface WorkflowModelSettingsProps {
  children: ReactNode;
}

export function WorkflowModelSettings({ children }: WorkflowModelSettingsProps) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-4 focus-visible:outline-2 focus-visible:outline-ring sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-6 text-foreground">按功能单独指定</h3>
            <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">可选</span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">为不同工作流选择默认模型；未单独设置时会使用上方的常用模型。</p>
        </div>
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        {children}
      </div>
    </details>
  );
}
