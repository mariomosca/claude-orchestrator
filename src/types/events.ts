/**
 * Events emitted during task execution
 */
export type TaskEventType =
  | 'task:started'
  | 'task:progress'
  | 'task:tool_use'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'batch:started'
  | 'batch:completed'
  | 'batch:failed';

export interface TaskStartedEvent {
  type: 'task:started';
  taskId: string;
  timestamp: Date;
  sessionId?: string;
}

export interface TaskProgressEvent {
  type: 'task:progress';
  taskId: string;
  timestamp: Date;
  text: string;
  cost: number;
  elapsed: number;
}

export interface TaskToolUseEvent {
  type: 'task:tool_use';
  taskId: string;
  timestamp: Date;
  tool: string;
  input: unknown;
}

export interface TaskCompletedEvent {
  type: 'task:completed';
  taskId: string;
  timestamp: Date;
  cost: number;
  duration: number;
  result: string;
}

export interface TaskFailedEvent {
  type: 'task:failed';
  taskId: string;
  timestamp: Date;
  cost: number;
  duration: number;
  error: string;
}

export interface TaskCancelledEvent {
  type: 'task:cancelled';
  taskId: string;
  timestamp: Date;
}

export interface BatchStartedEvent {
  type: 'batch:started';
  batchId: string;
  timestamp: Date;
  totalTasks: number;
}

export interface BatchCompletedEvent {
  type: 'batch:completed';
  batchId: string;
  timestamp: Date;
  totalCost: number;
  successCount: number;
  failedCount: number;
}

export type TaskEvent =
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskToolUseEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent
  | BatchStartedEvent
  | BatchCompletedEvent;
