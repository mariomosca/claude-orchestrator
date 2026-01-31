import React from 'react';
import { Box, Text } from 'ink';
import type { BatchState } from '../types/task.js';
import { formatCost, formatDuration } from '../utils/format.js';

interface StatusBarProps {
  state: BatchState;
  isPaused?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ state, isPaused }) => {
  const tasks = Object.values(state.tasks);
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const running = tasks.filter(t => t.status === 'running').length;
  const total = Object.keys(state.tasks).length;

  const elapsed = Date.now() - new Date(state.startedAt).getTime();

  // Calculate average cost per completed task
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.cost > 0);
  const avgCost = completedTasks.length > 0
    ? state.totalCost / completedTasks.length
    : 0;

  const statusColor = state.status === 'completed' ? 'green'
    : state.status === 'failed' ? 'red'
    : state.status === 'cancelled' ? 'yellow'
    : 'cyan';

  return (
    <Box
      borderStyle="single"
      borderColor={statusColor}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={statusColor} bold>
          {isPaused ? '⏸ PAUSED' : state.status.toUpperCase()}
        </Text>
        <Text> | </Text>
        <Text>
          {completed}/{total} done
          {failed > 0 && <Text color="red"> ({failed} failed)</Text>}
          {running > 0 && <Text color="green"> ({running} running)</Text>}
        </Text>
      </Box>

      <Box>
        <Text dimColor>Cost: </Text>
        <Text color="yellow">{formatCost(state.totalCost)}</Text>
        {avgCost > 0 && (
          <>
            <Text dimColor> (avg: </Text>
            <Text color="yellow">{formatCost(avgCost)}</Text>
            <Text dimColor>)</Text>
          </>
        )}
        <Text dimColor> | </Text>
        <Text>{formatDuration(elapsed)}</Text>
      </Box>
    </Box>
  );
};
