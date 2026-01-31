import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text } from 'ink';
import { Dashboard } from './components/Dashboard.js';
import { QueueManager } from './engine/queue.js';
import type { ParsedBatch } from './engine/parser.js';
import type { BatchState } from './types/task.js';
import type { EscalationRequest, EscalationResponse } from './engine/runner.js';

interface AppProps {
  manager: QueueManager;
  batch: ParsedBatch;
}

export const App: React.FC<AppProps> = ({ manager, batch }) => {
  const [state, setState] = useState<BatchState>(manager.getState());
  const [isPaused, setIsPaused] = useState(false);
  const [escalation, setEscalation] = useState<EscalationRequest | null>(null);

  // Subscribe to state updates
  useEffect(() => {
    const handleStateUpdated = (newState: BatchState) => {
      setState({ ...newState });
    };

    manager.on('state_updated', handleStateUpdated);

    // Also update on specific events
    const handleTaskEvent = () => {
      setState({ ...manager.getState() });
    };

    manager.on('task_started', handleTaskEvent);
    manager.on('task_completed', handleTaskEvent);
    manager.on('task_failed', handleTaskEvent);
    manager.on('task_progress', handleTaskEvent);

    // Handle escalations
    const handleEscalation = (request: EscalationRequest) => {
      setEscalation(request);
    };

    manager.on('escalation', handleEscalation);

    return () => {
      manager.off('state_updated', handleStateUpdated);
      manager.off('task_started', handleTaskEvent);
      manager.off('task_completed', handleTaskEvent);
      manager.off('task_failed', handleTaskEvent);
      manager.off('task_progress', handleTaskEvent);
      manager.off('escalation', handleEscalation);
    };
  }, [manager]);

  const handlePause = useCallback(() => {
    manager.pause();
    setIsPaused(true);
  }, [manager]);

  const handleResume = useCallback(() => {
    manager.resume();
    setIsPaused(false);
  }, [manager]);

  const handleCancel = useCallback((taskId: string) => {
    manager.cancelTask(taskId);
  }, [manager]);

  const handleRetry = useCallback(async (taskId: string) => {
    try {
      await manager.retryTask(taskId);
    } catch (err) {
      // Task not in failed state or not found
    }
  }, [manager]);

  const handleQuit = useCallback(() => {
    manager.cancelAll();
  }, [manager]);

  const handleEscalationResponse = useCallback((response: EscalationResponse) => {
    if (escalation) {
      manager.resolveEscalation(escalation.taskId, response);
      setEscalation(null);
    }
  }, [manager, escalation]);

  return (
    <Dashboard
      tasks={batch.tasks}
      state={state}
      isPaused={isPaused}
      escalation={escalation}
      onPause={handlePause}
      onResume={handleResume}
      onCancel={handleCancel}
      onRetry={handleRetry}
      onQuit={handleQuit}
      onEscalationResponse={handleEscalationResponse}
    />
  );
};

/**
 * Render the TUI application
 */
export function renderApp(manager: QueueManager, batch: ParsedBatch) {
  const { unmount, waitUntilExit } = render(
    <App manager={manager} batch={batch} />
  );

  return { unmount, waitUntilExit };
}
