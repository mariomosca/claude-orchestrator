import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { Dashboard } from './components/Dashboard.js';
import { PlanningPane, type TaskPlan } from './components/PlanningPane.js';
import { QueueManager } from './engine/queue.js';
import { analyzeTask } from './engine/analyzer.js';
import { getOrCreateProjectContext } from './engine/context.js';
import type { ParsedBatch, ParsedTask } from './engine/parser.js';
import type { BatchState } from './types/task.js';
import type { EscalationRequest, EscalationResponse } from './engine/runner.js';

type AppMode = 'planning' | 'running';

interface AppProps {
  manager: QueueManager;
  batch: ParsedBatch;
  skipPlanning?: boolean;
}

export const App: React.FC<AppProps> = ({ manager, batch, skipPlanning = false }) => {
  const { exit } = useApp();
  const [mode, setMode] = useState<AppMode>(skipPlanning ? 'running' : 'planning');
  const [taskPlans, setTaskPlans] = useState<TaskPlan[]>(() =>
    batch.tasks.map(task => ({ task, included: true }))
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [state, setState] = useState<BatchState>(manager.getState());
  const [isPaused, setIsPaused] = useState(false);
  const [escalation, setEscalation] = useState<EscalationRequest | null>(null);

  // Run AI analysis on mount (only in planning mode)
  useEffect(() => {
    if (mode !== 'planning' || skipPlanning) return;

    const runAnalysis = async () => {
      setIsAnalyzing(true);

      for (const taskPlan of taskPlans) {
        // Mark task as analyzing
        setTaskPlans(prev =>
          prev.map(tp =>
            tp.task.id === taskPlan.task.id ? { ...tp, analyzing: true } : tp
          )
        );

        try {
          // Load project context for better analysis
          const context = await getOrCreateProjectContext(taskPlan.task.cwd).catch(() => undefined);
          const analysis = await analyzeTask(taskPlan.task, context);

          setTaskPlans(prev =>
            prev.map(tp =>
              tp.task.id === taskPlan.task.id
                ? { ...tp, analysis, analyzing: false }
                : tp
            )
          );
        } catch {
          setTaskPlans(prev =>
            prev.map(tp =>
              tp.task.id === taskPlan.task.id
                ? { ...tp, analysis: 'Analisi non disponibile', analyzing: false }
                : tp
            )
          );
        }
      }

      setIsAnalyzing(false);
    };

    runAnalysis();
  }, [mode, skipPlanning]);

  // Start execution when entering running mode
  useEffect(() => {
    if (mode === 'running' && !skipPlanning) {
      // Filter batch to only included tasks
      const includedIds = new Set(taskPlans.filter(tp => tp.included).map(tp => tp.task.id));
      const filteredTasks = batch.tasks.filter(t => includedIds.has(t.id));

      if (filteredTasks.length > 0) {
        // Update batch with filtered tasks and start processing
        manager.startWithTasks(filteredTasks);
      }
    } else if (skipPlanning) {
      // Start immediately if planning was skipped
      manager.start();
    }
  }, [mode, skipPlanning]);

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

  // Planning mode handlers
  const handleApprove = useCallback((includedTaskIds: string[]) => {
    // Update taskPlans to reflect final selection
    setTaskPlans(prev =>
      prev.map(tp => ({
        ...tp,
        included: includedTaskIds.includes(tp.task.id)
      }))
    );
    setMode('running');
  }, []);

  const handleEditTask = useCallback((taskId: string) => {
    // For now, just log - could open an editor in future
    // TODO: Implement task editing
  }, []);

  const handleToggleTask = useCallback((taskId: string) => {
    setTaskPlans(prev =>
      prev.map(tp =>
        tp.task.id === taskId ? { ...tp, included: !tp.included } : tp
      )
    );
  }, []);

  const handlePlanCancel = useCallback(() => {
    exit();
  }, [exit]);

  // Show Planning Pane in planning mode
  if (mode === 'planning') {
    return (
      <PlanningPane
        tasks={taskPlans}
        onApprove={handleApprove}
        onEditTask={handleEditTask}
        onToggleTask={handleToggleTask}
        onCancel={handlePlanCancel}
        isAnalyzing={isAnalyzing}
      />
    );
  }

  // Show Dashboard in running mode
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

interface RenderOptions {
  skipPlanning?: boolean;
}

/**
 * Render the TUI application
 */
export function renderApp(
  manager: QueueManager,
  batch: ParsedBatch,
  options: RenderOptions = {}
) {
  const { unmount, waitUntilExit } = render(
    <App manager={manager} batch={batch} skipPlanning={options.skipPlanning} />
  );

  return { unmount, waitUntilExit };
}
