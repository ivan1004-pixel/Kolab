export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  supported: boolean;
  swActive: boolean;
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  cachedCount: number;
}

type Listener = (state: PwaState) => void;

const listeners = new Set<Listener>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

const state: PwaState = {
  supported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
  swActive: false,
  canInstall: false,
  isInstalled:
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true),
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  cachedCount: 0,
};

function notify() {
  const snapshot = { ...state };
  listeners.forEach((fn) => fn(snapshot));
}

export async function refreshCacheCount() {
  if (typeof caches === 'undefined') return 0;
  try {
    const keys = await caches.keys();
    let total = 0;
    for (const key of keys) {
      const cache = await caches.open(key);
      const reqs = await cache.keys();
      total += reqs.length;
    }
    state.cachedCount = total;
    notify();
    return total;
  } catch {
    return 0;
  }
}

export function initPwa() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    state.canInstall = true;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    state.canInstall = false;
    state.isInstalled = true;
    notify();
  });

  window.addEventListener('online', () => {
    state.isOnline = true;
    notify();
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    notify();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        state.swActive = Boolean(reg.active || reg.installing || reg.waiting);
        notify();
        return navigator.serviceWorker.ready;
      })
      .then(() => {
        state.swActive = true;
        notify();
        return refreshCacheCount();
      })
      .catch(() => {
        state.swActive = false;
        notify();
      });
  }
}

export function subscribePwa(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => {
    listeners.delete(fn);
  };
}

export async function triggerPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    deferredPrompt = null;
    state.canInstall = false;
    state.isInstalled = true;
    notify();
  }
  return choice.outcome;
}

export async function clearPwaCache() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await refreshCacheCount();
}
