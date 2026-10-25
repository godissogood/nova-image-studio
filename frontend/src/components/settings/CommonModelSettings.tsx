'use client';

import { ImageIcon, MessageSquare } from 'lucide-react';
import { Select, type SelectOption } from '@/components/ui/select';
import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import { changeCommonModel, countSeparateDefaults } from '@/lib/model-defaults';
import type { DefaultModels } from '@/lib/nova-models';

interface CommonModelSettingsProps {
  defaults: DefaultModels;
  imageOptions: SelectOption<string>[];
  textOptions: SelectOption<string>[];
  sliceCapableIds: string[];
  onChange: (defaults: DefaultModels) => void;
}

export function CommonModelSettings({ defaults, imageOptions, textOptions, sliceCapableIds, onChange }: CommonModelSettingsProps) {
  const separateCount = countSeparateDefaults(defaults, sliceCapableIds);
  return (
    <section aria-label="常用模型" className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <SettingsSectionHeading title="常用默认模型" description="为图片创作和文本推理选择常用模型。" />
      <div className="grid min-w-0 gap-5 sm:grid-cols-2 sm:divide-x sm:divide-border">
        <div className="min-w-0 space-y-3 sm:pr-5">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground"><ImageIcon className="size-4 text-primary" />常用图片模型</p>
          <Select ariaLabel="常用图片模型" className="min-h-11 bg-background" value={defaults.textToImage} options={imageOptions} disabled={!imageOptions.length}
            placeholder="请先添加图片模型" onValueChange={id => onChange(changeCommonModel(defaults, 'image', id, sliceCapableIds))} />
          <p className="text-sm leading-6 text-muted-foreground">用于生成和编辑图片。</p>
        </div>
        <div className="min-w-0 space-y-3 sm:pl-5">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground"><MessageSquare className="size-4 text-primary" />常用文本推理模型</p>
          <Select ariaLabel="常用文本模型" className="min-h-11 bg-background" value={defaults.agent} options={textOptions} disabled={!textOptions.length}
            placeholder="请先添加文本推理模型" onValueChange={id => onChange(changeCommonModel(defaults, 'text', id))} />
          <p className="text-sm leading-6 text-muted-foreground">用于 Agent 对话、提示词和图片理解。</p>
        </div>
      </div>
      {separateCount > 0 && <p className="border-t border-border pt-3 text-sm leading-6 text-muted-foreground">已保留 {separateCount} 项按功能单独选择的模型，修改常用模型不会覆盖它们。</p>}
    </section>
  );
}
