import { useSyncExternalStore } from 'react';
import { hasAnyApiKey } from '@/lib/settings-storage';

function subscribe(onChange: () => void) {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'nova-model-registry') onChange();
    };

    window.addEventListener('nova-model-registry-updated', onChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('nova-model-registry-updated', onChange);
      window.removeEventListener('storage', handleStorage);
    };
}

const getServerSnapshot = () => false;
const notifyApiKeyChange = () => window.dispatchEvent(new Event('nova-model-registry-updated'));

export function useApiKeyStatus() {
  const hasApiKey = useSyncExternalStore(subscribe, hasAnyApiKey, getServerSnapshot);

  return [hasApiKey, notifyApiKeyChange] as const;
}
