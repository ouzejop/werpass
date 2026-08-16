export const PIN_RELOCK_AFTER_MS = 60_000;

export function shouldRelockAfterBackground(backgroundedAt: number | null, now = Date.now()): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= PIN_RELOCK_AFTER_MS;
}
