// src/features/sync/syncScheduler.ts
// Tiny decoupling seam: ContactsContext announces "a local write happened"
// here after every mutation, and the sync engine (if running) registers a
// handler to debounce a push. Zero imports, so the contacts layer never
// depends on the sync feature — when sync is off this is a no-op.

type WriteHandler = () => void;

let handler: WriteHandler | null = null;

export function setSyncWriteHandler(h: WriteHandler | null): void {
  handler = h;
}

export function notifySyncWrite(): void {
  handler?.();
}
