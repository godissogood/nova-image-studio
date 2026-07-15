import { useEffect, useState } from 'react';
import { hasAnyApiKey } from '@/lib/settings-storage';

export function useApiKeyStatus() {
  const [hasApiKey, setHasApiKey] = useState(() => hasAnyApiKey());

  useEffect(() => {
    const syncApiKeyState = () => setHasApiKey(hasAnyApiKey());
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'nova-model-registry') syncApiKeyState();
    };

    window.addEventListener('nova-model-registry-updated', syncApiKeyState);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('nova-model-registry-updated', syncApiKeyState);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return [hasApiKey, setHasApiKey] as const;
}
