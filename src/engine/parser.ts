import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { expandPath } from '../utils/path.js';
import type { TaskDefinition, TaskBatch } from '../types/task.js';

/**
 * Raw YAML structure before validation
 */
interface RawTaskBatch {
  name?: string;
  maxConcurrent?: number;
  defaultBudget?: number;
  defaultModel?: string;
  defaultTools?: string[];
  globalInstructions?: string;
  escalationRules?: EscalationRuleConfig;
  tasks?: RawTask[];
}

interface RawTask {
  id: string;
  project?: string;
  cwd: string;
  prompt: string;
  model?: string;
  tools?: string[];
  budget?: number;
  dependsOn?: string[];
  instructions?: string;
  allowEscalation?: boolean;
  loadProjectContext?: boolean;
  saveLearnings?: boolean;
  guardrails?: TaskGuardrails;
}

interface EscalationRuleConfig {
  global?: Array<{
    pattern: string;
    action: 'ask_user' | 'warn' | 'block';
  }>;
  taskOverrides?: Record<string, {
    alwaysAsk?: boolean;
    requireConfirmation?: boolean;
  }>;
}

interface TaskGuardrails {
  requireConfirmation?: string[];
  neverModify?: string[];
  postModifyChecks?: string[];
  maxFilesModified?: number;
  escalateIfCostExceeds?: number;
}

/**
 * Extended TaskDefinition with all parsed options
 */
export interface ParsedTask extends TaskDefinition {
  model: string;
  instructions?: string;
  allowEscalation: boolean;
  loadProjectContext: boolean;
  saveLearnings: boolean;
  guardrails?: TaskGuardrails;
}

export interface ParsedBatch {
  name: string;
  maxConcurrent: number;
  defaultBudget: number;
  defaultModel: string;
  defaultTools: string[];
  globalInstructions?: string;
  escalationRules?: EscalationRuleConfig;
  tasks: ParsedTask[];
}

/**
 * Parse YAML content into TaskBatch
 */
export function parseTaskBatch(content: string): ParsedBatch {
  const raw = parseYaml(content) as RawTaskBatch;

  if (!raw.tasks || raw.tasks.length === 0) {
    throw new Error('No tasks defined in YAML');
  }

  const defaultModel = raw.defaultModel ?? 'sonnet';
  const defaultBudget = raw.defaultBudget ?? 5.0;
  const defaultTools = raw.defaultTools ?? ['Read', 'Edit', 'Glob', 'Grep'];

  const tasks: ParsedTask[] = raw.tasks.map((task, index) => {
    // Validate required fields
    if (!task.id) {
      throw new Error(`Task at index ${index} missing 'id'`);
    }
    if (!task.cwd) {
      throw new Error(`Task '${task.id}' missing 'cwd'`);
    }
    if (!task.prompt) {
      throw new Error(`Task '${task.id}' missing 'prompt'`);
    }

    return {
      id: task.id,
      project: task.project ?? extractProjectName(task.cwd),
      cwd: expandPath(task.cwd),
      prompt: task.prompt.trim(),
      model: task.model ?? defaultModel,
      tools: task.tools ?? defaultTools,
      budget: task.budget ?? defaultBudget,
      dependsOn: task.dependsOn ?? [],
      instructions: task.instructions,
      allowEscalation: task.allowEscalation ?? true,
      loadProjectContext: task.loadProjectContext ?? true,
      saveLearnings: task.saveLearnings ?? true,
      guardrails: task.guardrails
    };
  });

  // Validate dependencies exist
  const taskIds = new Set(tasks.map(t => t.id));
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (!taskIds.has(dep)) {
        throw new Error(`Task '${task.id}' depends on unknown task '${dep}'`);
      }
    }
  }

  return {
    name: raw.name ?? 'Unnamed Batch',
    maxConcurrent: raw.maxConcurrent ?? 3,
    defaultBudget,
    defaultModel,
    defaultTools,
    globalInstructions: raw.globalInstructions,
    escalationRules: raw.escalationRules,
    tasks
  };
}

/**
 * Load and parse YAML file
 */
export async function loadTaskFile(filePath: string): Promise<ParsedBatch> {
  const absolutePath = expandPath(filePath);
  const content = await readFile(absolutePath, 'utf-8');
  return parseTaskBatch(content);
}

/**
 * Extract project name from path
 */
function extractProjectName(path: string): string {
  const parts = path.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Validate a batch without loading
 */
export function validateBatch(batch: ParsedBatch): string[] {
  const errors: string[] = [];

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const task of batch.tasks) {
    if (ids.has(task.id)) {
      errors.push(`Duplicate task ID: '${task.id}'`);
    }
    ids.add(task.id);
  }

  // Check for self-dependencies
  for (const task of batch.tasks) {
    if (task.dependsOn?.includes(task.id)) {
      errors.push(`Task '${task.id}' depends on itself`);
    }
  }

  // Check budgets are positive
  for (const task of batch.tasks) {
    if (task.budget !== undefined && task.budget <= 0) {
      errors.push(`Task '${task.id}' has invalid budget: ${task.budget}`);
    }
  }

  return errors;
}
