/**
 * Task definition from YAML
 */
export interface TaskDefinition {
  id: string;
  project: string;
  cwd: string;
  prompt: string;
  tools?: string[];
  budget?: number;
  dependsOn?: string[];
}

/**
 * Batch of tasks from YAML file
 */
export interface TaskBatch {
  name: string;
  maxConcurrent: number;
  defaultBudget: number;
  defaultTools: string[];
  tasks: TaskDefinition[];
}

/**
 * Runtime status of a task
 */
export type TaskStatus =
  | 'pending'    // Not yet started
  | 'blocked'    // Waiting for dependencies
  | 'queued'     // Ready to run, waiting for slot
  | 'running'    // Currently executing
  | 'completed'  // Successfully finished
  | 'failed'     // Finished with error
  | 'cancelled'; // Aborted by user

/**
 * Runtime state of a task
 */
export interface TaskState {
  status: TaskStatus;
  sessionId?: string;
  startedAt?: Date;
  completedAt?: Date;
  cost: number;
  result?: string;
  error?: string;
  blockedBy?: string[];
  currentTool?: string;
  progress?: string;
}

/**
 * State of entire batch
 */
export interface BatchState {
  batchId: string;
  batchName: string;
  yamlPath: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalCost: number;
  tasks: Record<string, TaskState>;
}

/**
 * Serializable state for JSON persistence
 */
export interface PersistedBatchState {
  batchId: string;
  batchName: string;
  yamlPath: string;
  startedAt: string;
  completedAt?: string;
  status: BatchState['status'];
  totalCost: number;
  tasks: Record<string, {
    status: TaskStatus;
    sessionId?: string;
    startedAt?: string;
    completedAt?: string;
    cost: number;
    result?: string;
    error?: string;
  }>;
}
