import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent } from '../dialog';

describe('Dialog body scroll lock', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('locks scrolling only while the dialog is open', async () => {
    const { rerender } = render(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>Settings</DialogContent>
      </Dialog>,
    );

    await waitFor(() => expect(document.body.style.overflow).toBe(''));

    rerender(
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent>Settings</DialogContent>
      </Dialog>,
    );
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));

    rerender(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>Settings</DialogContent>
      </Dialog>,
    );
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });
});
