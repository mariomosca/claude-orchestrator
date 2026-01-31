import React from 'react';
import { Box, useInput, useApp } from 'ink';
import { TaskQueue } from './TaskQueue.js';
import { RunningPane } from './RunningPane.js';
import { LogPane } from './LogPane.js';
import { StatusBar } from './StatusBar.js';
import { HelpBar } from './HelpBar.js';
import { DetailsPane } from './DetailsPane.js';
import type { BatchState, TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';

interface DashboardProps {
  tasks: ParsedTask[];
  state: BatchState;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onQuit: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  state,
  isPaused,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onQuit,
}) => {
  const { exit } = useApp();
  const [focusedPane, setFocusedPane] = React.useState<'queue' | 'running' | 'log'>('running');
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);

  // Merge tasks with state
  const tasksWithState = tasks.map(task => ({
    ...task,
    state: state.tasks[task.id] as TaskState | undefined,
  }));

  const runningTasks = tasksWithState.filter(t => t.state?.status === 'running');
  const completedTasks = tasksWithState.filter(t => t.state?.status === 'completed' || t.state?.status === 'failed');
  const pendingTasks = tasksWithState.filter(t => !t.state || t.state.status === 'pending' || t.state.status === 'blocked');

  // Get task list for current pane
  const getCurrentPaneTasks = () => {
    switch (focusedPane) {
      case 'queue': return pendingTasks;
      case 'running': return runningTasks;
      case 'log': return completedTasks;
      default: return [];
    }
  };

  const selectedTask = selectedTaskId
    ? tasksWithState.find(t => t.id === selectedTaskId)
    : null;

  useInput((input, key) => {
    // Close details modal with Escape or Enter (when in details view)
    if (selectedTaskId && (key.escape || key.return)) {
      setSelectedTaskId(null);
      return;
    }

    // If details modal is open, ignore other inputs
    if (selectedTaskId) {
      return;
    }

    // Quit
    if (input === 'q' || input === 'Q') {
      onQuit();
      exit();
      return;
    }

    // Pause/Resume
    if (input === ' ') {
      if (isPaused) {
        onResume();
      } else {
        onPause();
      }
      return;
    }

    // Show details with Enter
    if (key.return) {
      const paneTasks = getCurrentPaneTasks();
      if (paneTasks.length > 0) {
        const taskIndex = Math.min(focusedIndex, paneTasks.length - 1);
        const task = paneTasks[taskIndex];
        if (task) {
          setSelectedTaskId(task.id);
        }
      }
      return;
    }

    // Cancel running task
    if ((input === 'c' || input === 'C') && runningTasks.length > 0) {
      const taskToCancel = runningTasks[focusedIndex % runningTasks.length];
      if (taskToCancel) {
        onCancel(taskToCancel.id);
      }
      return;
    }

    // Retry failed task
    if (input === 'r' || input === 'R') {
      const failedTasks = tasksWithState.filter(t => t.state?.status === 'failed');
      if (failedTasks.length > 0) {
        onRetry(failedTasks[0].id);
      }
      return;
    }

    // Navigation
    if (key.tab) {
      const panes: Array<'queue' | 'running' | 'log'> = ['queue', 'running', 'log'];
      const currentIndex = panes.indexOf(focusedPane);
      setFocusedPane(panes[(currentIndex + 1) % panes.length]);
      setFocusedIndex(0);
      return;
    }

    if (key.upArrow) {
      setFocusedIndex(Math.max(0, focusedIndex - 1));
      return;
    }

    if (key.downArrow) {
      setFocusedIndex(focusedIndex + 1);
      return;
    }
  });

  // If details modal is open, show it instead of the main view
  if (selectedTask) {
    return (
      <Box flexDirection="column" height="100%">
        <DetailsPane
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
        />
        <StatusBar state={state} isPaused={isPaused} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexGrow={1} flexDirection="row">
        <TaskQueue
          tasks={tasksWithState}
          focusedIndex={focusedPane === 'queue' ? focusedIndex : undefined}
        />
        <RunningPane
          tasks={tasksWithState.filter(t => t.state) as Array<ParsedTask & { state: TaskState }>}
          focusedIndex={focusedPane === 'running' ? focusedIndex : undefined}
        />
        <LogPane
          tasks={tasksWithState.filter(t => t.state) as Array<ParsedTask & { state: TaskState }>}
          focusedIndex={focusedPane === 'log' ? focusedIndex : undefined}
        />
      </Box>

      {/* Status bar */}
      <StatusBar state={state} isPaused={isPaused} />

      {/* Help bar */}
      <HelpBar isPaused={isPaused} />
    </Box>
  );
};
