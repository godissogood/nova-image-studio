import type { ReactNode } from 'react';

interface SettingsSectionHeadingProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SettingsSectionHeading({ title, description, action }: SettingsSectionHeadingProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <h3 className="text-lg font-semibold leading-6 text-foreground">{title}</h3>
        {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
