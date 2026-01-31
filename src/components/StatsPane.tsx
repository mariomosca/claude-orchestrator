import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { BatchState, TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';
import { formatCost, formatDuration } from '../utils/format.js';

interface StatsPaneProps {
  tasks: ParsedTask[];
  state: BatchState;
  onClose: () => void;
}

interface ProjectStats {
  taskCount: number;
  completed: number;
  failed: number;
  totalCost: number;
  avgCost: number;
  totalDuration: number;
}

export const StatsPane: React.FC<StatsPaneProps> = ({ tasks, state, onClose }) => {
  useInput((input, key) => {
    if (key.escape || key.return || input === 's' || input === 'S') {
      onClose();
    }
  });

  const taskStates = Object.values(state.tasks);
  const completedTasks = taskStates.filter(t => t.status === 'completed');
  const failedTasks = taskStates.filter(t => t.status === 'failed');
  const runningTasks = taskStates.filter(t => t.status === 'running');
  const pendingTasks = taskStates.filter(t => t.status === 'pending' || t.status === 'blocked');

  // Calculate overall stats
  const totalCost = taskStates.reduce((sum, t) => sum + t.cost, 0);
  const avgCost = completedTasks.length > 0 ? totalCost / completedTasks.length : 0;
  const elapsed = Date.now() - new Date(state.startedAt).getTime();

  // Calculate per-project stats
  const projectStats = new Map<string, ProjectStats>();

  for (const task of tasks) {
    const taskState = state.tasks[task.id];
    if (!taskState) continue;

    const projectId = task.project;
    const existing = projectStats.get(projectId) || {
      taskCount: 0,
      completed: 0,
      failed: 0,
      totalCost: 0,
      avgCost: 0,
      totalDuration: 0,
    };

    existing.taskCount++;
    existing.totalCost += taskState.cost;

    if (taskState.status === 'completed') {
      existing.completed++;
      if (taskState.completedAt && taskState.startedAt) {
        existing.totalDuration += new Date(taskState.completedAt).getTime() - new Date(taskState.startedAt).getTime();
      }
    }
    if (taskState.status === 'failed') {
      existing.failed++;
    }

    projectStats.set(projectId, existing);
  }

  // Calculate averages
  for (const [, stats] of projectStats) {
    if (stats.completed > 0) {
      stats.avgCost = stats.totalCost / stats.completed;
    }
  }

  // Sort projects by total cost descending
  const sortedProjects = Array.from(projectStats.entries())
    .sort((a, b) => b[1].totalCost - a[1].totalCost);

  // Calculate cost per minute if we have completed tasks
  const completedDurations = completedTasks
    .filter(t => t.completedAt && t.startedAt)
    .map(t => new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime());
  const totalTaskDuration = completedDurations.reduce((sum, d) => sum + d, 0);
  const costPerMinute = totalTaskDuration > 0 ? (totalCost / totalTaskDuration) * 60000 : 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      width="100%"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">Cost Analytics: </Text>
        <Text bold>{state.batchName}</Text>
        <Box flexGrow={1} />
        <Text dimColor>[Esc/Enter/S to close]</Text>
      </Box>

      {/* Overall stats */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Overall Summary</Text>
        <Box paddingLeft={1} flexDirection="column">
          <Box>
            <Box width={20}><Text dimColor>Total Cost:</Text></Box>
            <Text color="yellow" bold>{formatCost(totalCost)}</Text>
          </Box>
          <Box>
            <Box width={20}><Text dimColor>Avg Cost/Task:</Text></Box>
            <Text color="yellow">{formatCost(avgCost)}</Text>
          </Box>
          <Box>
            <Box width={20}><Text dimColor>Cost/Minute:</Text></Box>
            <Text color="yellow">{formatCost(costPerMinute)}</Text>
          </Box>
          <Box>
            <Box width={20}><Text dimColor>Elapsed Time:</Text></Box>
            <Text>{formatDuration(elapsed)}</Text>
          </Box>
        </Box>
      </Box>

      {/* Task status breakdown */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Task Status</Text>
        <Box paddingLeft={1}>
          <Box width={15}>
            <Text color="green">{completedTasks.length} completed</Text>
          </Box>
          <Box width={12}>
            <Text color="red">{failedTasks.length} failed</Text>
          </Box>
          <Box width={12}>
            <Text color="cyan">{runningTasks.length} running</Text>
          </Box>
          <Box width={12}>
            <Text dimColor>{pendingTasks.length} pending</Text>
          </Box>
        </Box>
      </Box>

      {/* Per-project breakdown */}
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">Cost by Project</Text>
        <Box paddingLeft={1} flexDirection="column">
          {/* Header row */}
          <Box>
            <Box width={25}><Text dimColor>Project</Text></Box>
            <Box width={12}><Text dimColor>Tasks</Text></Box>
            <Box width={12}><Text dimColor>Total</Text></Box>
            <Box width={12}><Text dimColor>Avg</Text></Box>
            <Box width={12}><Text dimColor>Duration</Text></Box>
          </Box>

          {sortedProjects.map(([project, stats]) => (
            <Box key={project}>
              <Box width={25}>
                <Text wrap="truncate">{project}</Text>
              </Box>
              <Box width={12}>
                <Text>
                  {stats.completed}/{stats.taskCount}
                  {stats.failed > 0 && <Text color="red"> ({stats.failed}!)</Text>}
                </Text>
              </Box>
              <Box width={12}>
                <Text color="yellow">{formatCost(stats.totalCost)}</Text>
              </Box>
              <Box width={12}>
                <Text dimColor>{formatCost(stats.avgCost)}</Text>
              </Box>
              <Box width={12}>
                <Text dimColor>{formatDuration(stats.totalDuration)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Top expensive tasks */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">Top 5 Most Expensive Tasks</Text>
        <Box paddingLeft={1} flexDirection="column">
          {Object.entries(state.tasks)
            .filter(([, t]) => t.cost > 0)
            .sort((a, b) => b[1].cost - a[1].cost)
            .slice(0, 5)
            .map(([taskId, taskState]) => (
              <Box key={taskId}>
                <Box width={30}>
                  <Text wrap="truncate">{taskId}</Text>
                </Box>
                <Text color="yellow">{formatCost(taskState.cost)}</Text>
              </Box>
            ))
          }
        </Box>
      </Box>
    </Box>
  );
};
