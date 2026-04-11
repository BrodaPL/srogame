const AUTO_SKIP_IDLE_MS_DEFAULT = 5 * 60 * 1000;
export const AUTO_SKIP_IDLE_MS_OVERRIDE_KEY = 'srogame:test:autoSkipIdleMs';

export function getMultiplayerAutoSkipIdleMs(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return AUTO_SKIP_IDLE_MS_DEFAULT;
  }

  const raw = window.localStorage.getItem(AUTO_SKIP_IDLE_MS_OVERRIDE_KEY);
  if (!raw) {
    return AUTO_SKIP_IDLE_MS_DEFAULT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return AUTO_SKIP_IDLE_MS_DEFAULT;
  }

  return parsed;
}

export function formatDurationLabel(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  }

  const totalMinutes = totalSeconds / 60;
  if (Number.isInteger(totalMinutes)) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }

  return `${totalMinutes.toFixed(1)} minutes`;
}
