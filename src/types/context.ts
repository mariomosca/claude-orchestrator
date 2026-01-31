/**
 * Project context types for stack detection and learning accumulation
 */

/**
 * Detected technology stack
 */
export interface DetectedStack {
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'other';
  framework?: string;
  packageManager?: string;
  testRunner?: string;
  buildTool?: string;
  hasDocker: boolean;
  hasCICD: boolean;
  monorepo: boolean;
}

/**
 * Learning extracted from task execution
 */
export interface Learning {
  id: string;
  date: string;
  taskId: string;
  type: 'pattern' | 'convention' | 'gotcha' | 'optimization';
  content: string;
  relevance: 'high' | 'medium' | 'low';
}

/**
 * Item to avoid in a project
 */
export interface AvoidItem {
  id: string;
  pattern: string;
  reason: string;
  addedFrom: string;
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Architectural decision record
 */
export interface Decision {
  id: string;
  date: string;
  taskId: string;
  question: string;
  decision: string;
  rationale: string;
}

/**
 * Instructions extracted from CLAUDE.md
 */
export interface ProjectInstructions {
  raw: string;
  keyPoints: string[];
  conventions: string[];
  avoidList: string[];
}

/**
 * Full project context
 */
export interface ProjectContext {
  projectId: string;
  projectPath: string;
  lastUpdated: string;

  detected: DetectedStack;
  instructions: ProjectInstructions;
  learnings: Learning[];
  projectAvoidList: AvoidItem[];
  decisions: Decision[];
}

/**
 * Global learnings across projects
 */
export interface GlobalLearnings {
  lastUpdated: string;

  universalPatterns: Array<{
    id: string;
    pattern: string;
    context: string;
    frequency: number;
  }>;

  techPreferences: Record<string, string>;
}

/**
 * Global avoid list across projects
 */
export interface GlobalAvoidList {
  lastUpdated: string;

  items: Array<{
    id: string;
    pattern: string;
    reason: string;
    occurrences: number;
    projects: string[];
  }>;
}
