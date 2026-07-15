'use client';

import { useEffect, useState } from 'react';
import { syncDynamicModelExports } from '@/lib/gemini-config';

const MODEL_REGISTRY_STORAGE_KEY = 'nova-model-registry';

export function useModelRegistryRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const syncRegistry = () => {
      syncDynamicModelExports();
      setRevision(current => current + 1);
    };
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === MODEL_REGISTRY_STORAGE_KEY) syncRegistry();
    };

    window.addEventListener('nova-model-registry-updated', syncRegistry);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('nova-model-registry-updated', syncRegistry);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return revision;
}
