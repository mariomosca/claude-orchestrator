import React from 'react';
import { Box, Text } from 'ink';
import type { TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';
import { formatCost, formatDuration } from '../utils/format.js';

interface LogPaneProps {
  tasks: Array<ParsedTask & { state: TaskState }>;
  maxItems?: number;
  focusedIndex?: number;
}

export const LogPane: React.FC<LogPaneProps> = ({ tasks, maxItems = 10, focusedIndex }) => {
  const completedTasks = tasks
    .filter(t => t.state?.status === 'completed' || t.state?.status === 'failed' || t.state?.status === 'cancelled')
    .slice(-maxItems);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold>Log</Text>
      </Box>

      {completedTasks.length === 0 ? (
        <Text dimColor>No completed tasks yet</Text>
      ) : (
        completedTasks.map((task, index) => {
          const duration = task.state.startedAt && task.state.completedAt
            ? new Date(task.state.completedAt).getTime() - new Date(task.state.startedAt).getTime()
            : 0;

          const statusIcon = task.state.status === 'completed' ? '✓'
            : task.state.status === 'failed' ? '✗'
            : '⊘';

          const statusColor = task.state.status === 'completed' ? 'green'
            : task.state.status === 'failed' ? 'red'
            : 'yellow';

          const isFocused = focusedIndex === index;

          return (
            <Box key={task.id}>
              <Text color={statusColor} inverse={isFocused}>{statusIcon}</Text>
              <Text inverse={isFocused}> {task.id} </Text>
              <Text dimColor>
                {formatCost(task.state.cost)} | {formatDuration(duration)}
              </Text>
              {task.state.error && (
                <Text color="red"> - {task.state.error.slice(0, 30)}</Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
};
