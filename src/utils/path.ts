import { homedir } from 'os';
import { resolve, isAbsolute } from 'path';

/**
 * Expand ~ to home directory and resolve to absolute path
 */
export function expandPath(inputPath: string): string {
  let expanded = inputPath;

  // Expand ~
  if (expanded.startsWith('~/')) {
    expanded = expanded.replace('~', homedir());
  } else if (expanded === '~') {
    expanded = homedir();
  }

  // Resolve to absolute
  if (!isAbsolute(expanded)) {
    expanded = resolve(process.cwd(), expanded);
  }

  return expanded;
}

/**
 * Collapse home directory to ~ for display
 */
export function collapsePath(inputPath: string): string {
  const home = homedir();
  if (inputPath.startsWith(home)) {
    return inputPath.replace(home, '~');
  }
  return inputPath;
}

/**
 * Extract project name from path
 */
export function getProjectName(projectPath: string): string {
  const parts = projectPath.split('/');
  return parts[parts.length - 1] || 'unknown';
}
