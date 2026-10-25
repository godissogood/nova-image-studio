'use client';

import { useEffect, useState } from 'react';

const DESKTOP_LAYOUT_QUERY = '(min-width: 1280px)';
const LEGACY_LAYOUT_PREFERENCE = 'nova-wide-mode';

function dismissBootLoader(): void {
  const el = document.getElementById('app-boot-loader');
  if (el) el.style.display = 'none';
}

export function useResponsiveWorkspaceLayout() {
  const [desktopLayout, setDesktopLayout] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_LAYOUT_QUERY);
    const updateLayout = () => setDesktopLayout(query.matches);

    updateLayout();
    query.addEventListener('change', updateLayout);
    try {
      localStorage.removeItem(LEGACY_LAYOUT_PREFERENCE);
    } catch {
      // Storage can be unavailable in hardened/private browser modes.
    }
    dismissBootLoader();

    return () => query.removeEventListener('change', updateLayout);
  }, []);

  return { desktopLayout };
}
