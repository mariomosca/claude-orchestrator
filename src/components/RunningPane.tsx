import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';
import { formatCost, formatDuration } from '../utils/format.js';

interface RunningPaneProps {
  tasks: Array<ParsedTask & { state: TaskState }>;
  focusedIndex?: number;
  isFocusedPane?: boolean;
}

export const RunningPane: React.FC<RunningPaneProps> = ({ tasks, focusedIndex, isFocusedPane }) => {
  const runningTasks = tasks.filter(t => t.state?.status === 'running');

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocusedPane ? 'double' : 'single'}
      borderColor={isFocusedPane ? 'greenBright' : 'green'}
      paddingX={1}
      minWidth={30}
    >
      <Box marginBottom={1}>
        <Text bold color="green" inverse={isFocusedPane}>
          {isFocusedPane ? ' Running ' : 'Running'} ({runningTasks.length})
        </Text>
      </Box>

      {runningTasks.length === 0 ? (
        <Text dimColor>No tasks running</Text>
      ) : (
        runningTasks.map((task, index) => {
          const elapsed = task.state.startedAt
            ? Date.now() - new Date(task.state.startedAt).getTime()
            : 0;
          const isFocused = focusedIndex === index;

          return (
            <Box key={task.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color="green" inverse={isFocused}>
                  <Spinner type="dots" /> {task.id}
                </Text>
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor>{task.project}</Text>
              </Box>
              {task.state.progress && (
                <Box paddingLeft={2}>
                  <Text color="gray">{task.state.progress.slice(0, 40)}...</Text>
                </Box>
              )}
              {task.state.currentTool && (
                <Box paddingLeft={2}>
                  <Text color="blue">Using: {task.state.currentTool}</Text>
                </Box>
              )}
              <Box paddingLeft={2}>
                <Text dimColor>
                  {formatCost(task.state.cost)} | {formatDuration(elapsed)}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
};
