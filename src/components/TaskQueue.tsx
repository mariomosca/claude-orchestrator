import React from 'react';
import { Box, Text } from 'ink';
import type { TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';

interface TaskQueueProps {
  tasks: Array<ParsedTask & { state?: TaskState }>;
  focusedIndex?: number;
  isFocusedPane?: boolean;
}

export const TaskQueue: React.FC<TaskQueueProps> = ({ tasks, focusedIndex, isFocusedPane }) => {
  const pendingTasks = tasks.filter(t =>
    !t.state || t.state.status === 'pending' || t.state.status === 'blocked'
  );

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocusedPane ? 'double' : 'single'}
      borderColor={isFocusedPane ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan" inverse={isFocusedPane}>
          {isFocusedPane ? ' Queue ' : 'Queue'} ({pendingTasks.length})
        </Text>
      </Box>

      {pendingTasks.length === 0 ? (
        <Text dimColor>No pending tasks</Text>
      ) : (
        pendingTasks.map((task, i) => {
          const isBlocked = task.state?.status === 'blocked';
          const isFocused = focusedIndex === i;

          return (
            <Box key={task.id}>
              <Text color={isFocused ? 'yellow' : undefined}>
                {isFocused ? '▶ ' : '  '}
                {isBlocked ? '⏸' : '○'} {task.id}
                {isBlocked && task.state?.blockedBy && (
                  <Text dimColor> ← {task.state.blockedBy.join(', ')}</Text>
                )}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
};
