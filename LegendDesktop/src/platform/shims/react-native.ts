// The slice of react-native that Legend's shared (non-UI) modules touch:
// Platform, Linking, Alert, AppState. Desktop renders with React DOM, so the
// shared code takes its `Platform.OS === 'web'` paths (localStorage,
// window.confirm) and links go to the OS through the Electron bridge.

import { openExternal } from '../bridge';

export const Platform = {
  // Widened so shared `Platform.OS === 'ios'` checks still typecheck.
  OS: 'web' as 'web' | 'ios' | 'android',
  select<T>(spec: { web?: T; default?: T }): T | undefined {
    return 'web' in spec ? spec.web : spec.default;
  },
};

export const Linking = {
  async openURL(url: string): Promise<void> {
    const ok = await openExternal(url);
    if (!ok) throw new Error(`Can't open ${url}`);
  },
  async canOpenURL(): Promise<boolean> {
    return true;
  },
};

export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: { text: string; style?: string; onPress?: () => void }[],
  ): void {
    const text = message ? `${title}\n\n${message}` : title;
    if (buttons && buttons.length > 1) {
      // Cancel/OK pair (see @legend/lib/notify confirm()).
      if (window.confirm(text)) buttons.find((b) => b.style !== 'cancel')?.onPress?.();
      return;
    }
    window.alert(text);
    buttons?.[0]?.onPress?.();
  },
};

type AppStateStatus = 'active' | 'background';

export const AppState = {
  get currentState(): AppStateStatus {
    return document.visibilityState === 'visible' ? 'active' : 'background';
  },
  addEventListener(_type: 'change', cb: (s: AppStateStatus) => void) {
    const handler = () => cb(AppState.currentState);
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return {
      remove() {
        document.removeEventListener('visibilitychange', handler);
        window.removeEventListener('focus', handler);
      },
    };
  },
};
