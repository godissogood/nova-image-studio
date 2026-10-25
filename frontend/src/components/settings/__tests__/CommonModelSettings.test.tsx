import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommonModelSettings } from '@/components/settings/CommonModelSettings';
import { WorkflowModelSettings } from '@/components/settings/WorkflowModelSettings';
import { DEFAULT_DEFAULTS } from '@/lib/nova-models';

vi.mock('@/components/ui/select', () => ({
  Select: ({ ariaLabel, value, options, disabled, onValueChange }: { ariaLabel: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onValueChange: (value: string) => void }) =>
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}));
afterEach(cleanup);

function Harness({ empty = false, custom = false }: { empty?: boolean; custom?: boolean }) {
  const [defaults, setDefaults] = useState({ ...DEFAULT_DEFAULTS, textToImage: 'image-a', imageToImage: 'image-a', agent: 'text-a', reversePrompt: custom ? 'vision' : 'text-a' });
  return <><main><CommonModelSettings defaults={defaults} onChange={setDefaults} sliceCapableIds={['image-a']}
    imageOptions={empty ? [] : [{ value: 'image-a', label: '图片 A' }]} textOptions={empty ? [] : [{ value: 'text-a', label: '文本 A' }, { value: 'text-b', label: '文本 B' }]} />
    <WorkflowModelSettings>
      <button>九项详细配置</button>
    </WorkflowModelSettings></main><output data-testid="defaults">{JSON.stringify(defaults)}</output></>;
}

describe('beginner model defaults', () => {
  it('keeps workflow-specific settings as a separate bottom section and reveals them on demand', () => {
    render(<Harness />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    const defaultsSection = screen.getByRole('region', { name: '常用模型' });
    const workflowSection = screen.getByText('按功能单独指定').closest('details');
    expect(defaultsSection).not.toContainElement(workflowSection);
    expect(defaultsSection.parentElement?.lastElementChild).toBe(workflowSection);
    expect(screen.getByRole('button', { name: '九项详细配置' })).not.toBeVisible();
    fireEvent.click(screen.getByText('按功能单独指定'));
    expect(screen.getByRole('button', { name: '九项详细配置' })).toBeVisible();
  });

  it('explains retained individual choices and preserves them when changing the common text model', () => {
    render(<Harness custom />);
    expect(screen.getByText(/已保留 1 项/)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '常用文本模型' }), { target: { value: 'text-b' } });
    const defaults = JSON.parse(screen.getByTestId('defaults').textContent!);
    expect(defaults.agent).toBe('text-b');
    expect(defaults.reversePrompt).toBe('vision');
    expect(defaults.promptOptimize).toBe('text-b');
  });

  it('disables pickers until usable models have been added', () => {
    render(<Harness empty />);
    expect(screen.getByRole('combobox', { name: '常用图片模型' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '常用文本模型' })).toBeDisabled();
  });
});
