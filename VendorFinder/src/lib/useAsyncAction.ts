// src/lib/useAsyncAction.ts
// The error / busy / try-catch trio every screen was hand-rolling.
//
// Screens repeated the same shape a dozen times: clear the banners, flip a
// spinner on, await the call, funnel any throw through toAppError, flip the
// spinner off. Getting one of those steps wrong (usually the `finally`) leaves
// a button spinning forever, so it is worth having in exactly one place.
//
//   const { error, notice, busy, run } = useAsyncAction();
//   const save = () => run(async () => { await save(); setNotice('Saved.'); });
//
// Pass a `label` when a screen has two independently-spinning buttons that
// share one error banner:
//
//   run(check, 'check');  ...  <Button loading={isBusy('check')} />

import { useCallback, useMemo, useState } from 'react';
import { toAppError } from './errors';

export interface AsyncActionOptions {
  /** Override how a thrown value becomes banner text. */
  formatError?: (e: unknown) => string;
}

export interface AsyncAction {
  error: string;
  notice: string;
  /** True while any run() is in flight. */
  busy: boolean;
  /** True while a run() tagged with `label` is in flight. */
  isBusy: (label: string) => boolean;
  run: (fn: () => Promise<void>, label?: string) => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

const DEFAULT_LABEL = 'default';

export function useAsyncAction(options: AsyncActionOptions = {}): AsyncAction {
  const { formatError } = options;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<void>, label: string = DEFAULT_LABEL) => {
      setError('');
      setNotice('');
      setPending(label);
      try {
        await fn();
      } catch (e) {
        setError(formatError ? formatError(e) : toAppError(e).message);
      } finally {
        setPending(null);
      }
    },
    [formatError],
  );

  const isBusy = useCallback((label: string) => pending === label, [pending]);

  return useMemo(
    () => ({ error, notice, busy: pending !== null, isBusy, run, setError, setNotice }),
    [error, notice, pending, isBusy, run],
  );
}
