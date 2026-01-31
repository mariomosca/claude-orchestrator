import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { BatchState, TaskState, PersistedBatchState, TaskStatus } from '../types/task.js';

const STATE_DIR = 'state';
const LOGS_DIR = 'logs';

/**
 * Convert BatchState to persistable format
 */
function serializeBatchState(state: BatchState): PersistedBatchState {
  const tasks: PersistedBatchState['tasks'] = {};

  for (const [id, taskState] of Object.entries(state.tasks)) {
    tasks[id] = {
      status: taskState.status,
      sessionId: taskState.sessionId,
      startedAt: taskState.startedAt?.toISOString(),
      completedAt: taskState.completedAt?.toISOString(),
      cost: taskState.cost,
      result: taskState.result,
      error: taskState.error
    };
  }

  return {
    batchId: state.batchId,
    batchName: state.batchName,
    yamlPath: state.yamlPath,
    startedAt: state.startedAt.toISOString(),
    completedAt: state.completedAt?.toISOString(),
    status: state.status,
    totalCost: state.totalCost,
    tasks
  };
}

/**
 * Convert persisted format back to BatchState
 */
function deserializeBatchState(persisted: PersistedBatchState): BatchState {
  const tasks: Record<string, TaskState> = {};

  for (const [id, taskState] of Object.entries(persisted.tasks)) {
    tasks[id] = {
      status: taskState.status,
      sessionId: taskState.sessionId,
      startedAt: taskState.startedAt ? new Date(taskState.startedAt) : undefined,
      completedAt: taskState.completedAt ? new Date(taskState.completedAt) : undefined,
      cost: taskState.cost,
      result: taskState.result,
      error: taskState.error
    };
  }

  return {
    batchId: persisted.batchId,
    batchName: persisted.batchName,
    yamlPath: persisted.yamlPath,
    startedAt: new Date(persisted.startedAt),
    completedAt: persisted.completedAt ? new Date(persisted.completedAt) : undefined,
    status: persisted.status,
    totalCost: persisted.totalCost,
    tasks
  };
}

/**
 * Generate state file path from batch ID
 */
export function getStateFilePath(batchId: string, baseDir: string = process.cwd()): string {
  return join(baseDir, STATE_DIR, `${batchId}.state.json`);
}

/**
 * Save batch state to file
 */
export async function saveBatchState(
  state: BatchState,
  baseDir: string = process.cwd()
): Promise<string> {
  const filePath = getStateFilePath(state.batchId, baseDir);
  const dir = dirname(filePath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const serialized = serializeBatchState(state);
  await writeFile(filePath, JSON.stringify(serialized, null, 2), 'utf-8');

  return filePath;
}

/**
 * Load batch state from file
 */
export async function loadBatchState(filePath: string): Promise<BatchState> {
  const content = await readFile(filePath, 'utf-8');
  const persisted = JSON.parse(content) as PersistedBatchState;
  return deserializeBatchState(persisted);
}

/**
 * Check if state file exists
 */
export function stateExists(batchId: string, baseDir: string = process.cwd()): boolean {
  const filePath = getStateFilePath(batchId, baseDir);
  return existsSync(filePath);
}

/**
 * Create initial batch state
 */
export function createBatchState(
  batchId: string,
  batchName: string,
  yamlPath: string,
  taskIds: string[]
): BatchState {
  const tasks: Record<string, TaskState> = {};

  for (const id of taskIds) {
    tasks[id] = {
      status: 'pending',
      cost: 0
    };
  }

  return {
    batchId,
    batchName,
    yamlPath,
    startedAt: new Date(),
    status: 'pending',
    totalCost: 0,
    tasks
  };
}

/**
 * Update task state within batch
 */
export function updateTaskState(
  state: BatchState,
  taskId: string,
  update: Partial<TaskState>
): BatchState {
  const existingTask = state.tasks[taskId] ?? { status: 'pending' as TaskStatus, cost: 0 };

  return {
    ...state,
    tasks: {
      ...state.tasks,
      [taskId]: {
        ...existingTask,
        ...update
      }
    }
  };
}

/**
 * Calculate batch statistics
 */
export function getBatchStats(state: BatchState): {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalCost: number;
} {
  const tasks = Object.values(state.tasks);

  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending' || t.status === 'blocked' || t.status === 'queued').length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
    totalCost: tasks.reduce((sum, t) => sum + t.cost, 0)
  };
}

/**
 * Get log file path for a task
 */
export function getLogFilePath(
  batchId: string,
  taskId: string,
  baseDir: string = process.cwd()
): string {
  return join(baseDir, LOGS_DIR, batchId, `${taskId}.log`);
}

/**
 * Append to task log
 */
export async function appendToLog(
  batchId: string,
  taskId: string,
  content: string,
  baseDir: string = process.cwd()
): Promise<void> {
  const filePath = getLogFilePath(batchId, taskId, baseDir);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${content}\n`;

  await writeFile(filePath, line, { flag: 'a' });
}

/**
 * Save structured task result
 */
export async function saveTaskResult(
  batchId: string,
  taskId: string,
  result: TaskState,
  baseDir: string = process.cwd()
): Promise<void> {
  const logDir = join(baseDir, LOGS_DIR, batchId);

  if (!existsSync(logDir)) {
    await mkdir(logDir, { recursive: true });
  }

  const filePath = join(logDir, `${taskId}.result.json`);
  await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}
