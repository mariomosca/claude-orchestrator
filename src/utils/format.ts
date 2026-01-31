/**
 * Format cost in USD with proper precision
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Format elapsed time since a date
 */
export function formatElapsed(startedAt: Date): string {
  const elapsed = Date.now() - startedAt.getTime();
  return formatDuration(elapsed);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format task status with icon
 */
export function formatStatus(status: string): string {
  const icons: Record<string, string> = {
    pending: '○',
    blocked: '◌',
    queued: '◎',
    running: '◉',
    completed: '✓',
    failed: '✗',
    cancelled: '⊘'
  };
  return icons[status] || status;
}

/**
 * Format percentage
 */
export function formatPercent(current: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((current / total) * 100)}%`;
}
