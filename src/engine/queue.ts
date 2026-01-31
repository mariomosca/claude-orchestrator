import { EventEmitter } from 'events';
import type { BatchState, TaskState } from '../types/task.js';
import type { TaskEvent } from '../types/events.js';
import type { ParsedBatch, ParsedTask } from './parser.js';
import { TaskRunner, EscalationRequest, EscalationResponse } from './runner.js';
import { getReadyTasks, analyzeDAG } from './dag.js';
import {
  createBatchState,
  updateTaskState,
  saveBatchState,
  getBatchStats
} from './state.js';

/**
 * Events emitted by QueueManager
 */
export interface QueueManagerEvents {
  batch_started: (batchId: string, totalTasks: number) => void;
  batch_completed: (state: BatchState) => void;
  task_started: (taskId: string) => void;
  task_completed: (taskId: string, state: TaskState) => void;
  task_failed: (taskId: string, error: string) => void;
  task_progress: (taskId: string, progress: string) => void;
  task_tool_use: (taskId: string, tool: string) => void;
  escalation: (request: EscalationRequest) => void;
  state_updated: (state: BatchState) => void;
}

/**
 * Options for QueueManager
 */
export interface QueueManagerOptions {
  maxConcurrent: number;
  autoSaveInterval?: number; // ms, default 5000
  baseDir?: string;
}

/**
 * QueueManager orchestrates execution of task batches
 */
export class QueueManager extends EventEmitter {
  private batch: ParsedBatch;
  private state: BatchState;
  private options: Required<QueueManagerOptions>;
  private runners: Map<string, TaskRunner> = new Map();
  private saveInterval?: NodeJS.Timeout;
  private paused: boolean = false;
  private pendingEscalations: Map<string, EscalationRequest> = new Map();

  constructor(batch: ParsedBatch, yamlPath: string, options: Partial<QueueManagerOptions> = {}) {
    super();

    this.batch = batch;
    this.options = {
      maxConcurrent: options.maxConcurrent ?? batch.maxConcurrent,
      autoSaveInterval: options.autoSaveInterval ?? 5000,
      baseDir: options.baseDir ?? process.cwd()
    };

    // Create initial state
    const batchId = this.generateBatchId();
    this.state = createBatchState(
      batchId,
      batch.name,
      yamlPath,
      batch.tasks.map(t => t.id)
    );
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    const date = new Date().toISOString().split('T')[0];
    const slug = this.batch.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    const rand = Math.random().toString(36).slice(2, 6);
    return `${date}-${slug}-${rand}`;
  }

  /**
   * Start processing the batch
   */
  async start(): Promise<BatchState> {
    this.state.status = 'running';
    this.emit('batch_started', this.state.batchId, this.batch.tasks.length);

    // Start auto-save
    this.saveInterval = setInterval(() => {
      this.saveState();
    }, this.options.autoSaveInterval);

    try {
      await this.processLoop();
    } finally {
      // Stop auto-save
      if (this.saveInterval) {
        clearInterval(this.saveInterval);
      }

      // Final save
      await this.saveState();
    }

    this.emit('batch_completed', this.state);
    return this.state;
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    const taskMap = new Map(this.batch.tasks.map(t => [t.id, t]));
    const completed = new Set<string>();
    const failed = new Set<string>();
    const running = new Set<string>();

    while (completed.size + failed.size < this.batch.tasks.length) {
      // Check if paused
      if (this.paused) {
        await this.waitForResume();
      }

      // Get tasks ready to run
      const ready = getReadyTasks(this.batch.tasks, completed, running);

      // Start tasks up to maxConcurrent
      const available = this.options.maxConcurrent - running.size;
      const toStart = ready.slice(0, available);

      for (const task of toStart) {
        running.add(task.id);
        this.startTask(task);
      }

      // Wait for any task to complete
      if (running.size > 0) {
        const result = await this.waitForAnyComplete(running);

        running.delete(result.taskId);

        if (result.status === 'completed') {
          completed.add(result.taskId);
        } else {
          failed.add(result.taskId);
        }

        // Recalculate total cost
        this.state.totalCost = Object.values(this.state.tasks)
          .reduce((sum, t) => sum + t.cost, 0);

        this.emit('state_updated', this.state);
      }

      // Small delay to prevent tight loop
      await new Promise(r => setTimeout(r, 100));
    }

    // Update batch status
    const stats = getBatchStats(this.state);
    if (stats.failed > 0) {
      this.state.status = 'failed';
    } else if (stats.cancelled > 0) {
      this.state.status = 'cancelled';
    } else {
      this.state.status = 'completed';
    }

    this.state.completedAt = new Date();
  }

  /**
   * Start a single task
   */
  private startTask(task: ParsedTask): void {
    const runner = new TaskRunner(this.state.batchId, this.options.baseDir);
    this.runners.set(task.id, runner);

    // Forward events
    runner.on('started', (e) => {
      this.emit('task_started', task.id);
    });

    runner.on('progress', (e) => {
      this.state = updateTaskState(this.state, task.id, {
        progress: e.text,
        cost: e.cost
      });
      this.emit('task_progress', task.id, e.text);
    });

    runner.on('tool_use', (e) => {
      this.state = updateTaskState(this.state, task.id, {
        currentTool: e.tool
      });
      this.emit('task_tool_use', task.id, e.tool);
    });

    runner.on('escalation', (request) => {
      this.pendingEscalations.set(task.id, request);
      this.emit('escalation', request);
    });

    runner.on('completed', (e) => {
      this.emit('task_completed', task.id, this.state.tasks[task.id]);
    });

    runner.on('failed', (e) => {
      this.emit('task_failed', task.id, e.error);
    });

    // Update state to running
    this.state = updateTaskState(this.state, task.id, {
      status: 'running',
      startedAt: new Date()
    });

    // Get existing session ID if resuming
    const existingSessionId = this.state.tasks[task.id]?.sessionId;

    // Run task
    runner.run(task, existingSessionId, this.batch.globalInstructions)
      .then((result) => {
        this.state = updateTaskState(this.state, task.id, result);
        this.runners.delete(task.id);
      })
      .catch((error) => {
        this.state = updateTaskState(this.state, task.id, {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        });
        this.runners.delete(task.id);
      });
  }

  /**
   * Wait for any running task to complete
   */
  private async waitForAnyComplete(running: Set<string>): Promise<{ taskId: string; status: string }> {
    return new Promise((resolve) => {
      const check = () => {
        for (const taskId of running) {
          const state = this.state.tasks[taskId];
          if (state && (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled')) {
            if (!this.runners.has(taskId)) {
              resolve({ taskId, status: state.status });
              return;
            }
          }
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  /**
   * Wait for resume after pause
   */
  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.paused) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Pause processing (no new tasks started)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Cancel a specific task
   */
  cancelTask(taskId: string): void {
    const runner = this.runners.get(taskId);
    if (runner) {
      runner.abort();
    }
  }

  /**
   * Cancel all running tasks
   */
  cancelAll(): void {
    for (const runner of this.runners.values()) {
      runner.abort();
    }
    this.state.status = 'cancelled';
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<void> {
    const task = this.batch.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const taskState = this.state.tasks[taskId];
    if (taskState?.status !== 'failed') {
      throw new Error(`Task is not failed: ${taskId}`);
    }

    // Reset task state (keep session ID for context)
    this.state = updateTaskState(this.state, taskId, {
      status: 'pending',
      error: undefined,
      completedAt: undefined
    });

    // Task will be picked up by main loop
  }

  /**
   * Respond to an escalation
   */
  resolveEscalation(taskId: string, response: EscalationResponse): void {
    const runner = this.runners.get(taskId);
    if (runner) {
      runner.resolveEscalation(response);
    }
    this.pendingEscalations.delete(taskId);
  }

  /**
   * Get pending escalations
   */
  getPendingEscalations(): EscalationRequest[] {
    return Array.from(this.pendingEscalations.values());
  }

  /**
   * Save current state to disk
   */
  async saveState(): Promise<void> {
    await saveBatchState(this.state, this.options.baseDir);
  }

  /**
   * Get current state
   */
  getState(): BatchState {
    return { ...this.state };
  }

  /**
   * Get batch statistics
   */
  getStats() {
    return getBatchStats(this.state);
  }

  /**
   * Get DAG analysis
   */
  getDAGAnalysis() {
    return analyzeDAG(this.batch.tasks);
  }
}

/**
 * Resume a batch from saved state
 */
export async function resumeBatch(
  batch: ParsedBatch,
  savedState: BatchState,
  options: Partial<QueueManagerOptions> = {}
): Promise<QueueManager> {
  const manager = new QueueManager(batch, savedState.yamlPath, options);

  // Override state with saved state
  (manager as any).state = savedState;

  // Reset running tasks to pending (they were interrupted)
  for (const [taskId, taskState] of Object.entries(savedState.tasks)) {
    if (taskState.status === 'running') {
      (manager as any).state = updateTaskState((manager as any).state, taskId, {
        status: 'pending'
      });
    }
  }

  return manager;
}
