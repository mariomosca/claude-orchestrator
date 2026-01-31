import React from 'react';
import { Box, Text } from 'ink';
import type { TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';
import { formatCost, formatDuration, formatStatus } from '../utils/format.js';
import { categorizeError, getErrorInfo } from './ErrorBoundary.js';

interface DetailsPaneProps {
  task: ParsedTask & { state?: TaskState };
  onClose: () => void;
}

export const DetailsPane: React.FC<DetailsPaneProps> = ({ task, onClose }) => {
  const state = task.state;
  const duration = state?.completedAt && state?.startedAt
    ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
    : 0;

  // Truncate result if too long (max 15 lines for TUI)
  const resultLines = (state?.result || 'No output yet').split('\n');
  const maxLines = 12;
  const truncatedResult = resultLines.length > maxLines
    ? [...resultLines.slice(0, maxLines), `... (${resultLines.length - maxLines} more lines)`]
    : resultLines;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
      width="100%"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Task Details: </Text>
        <Text bold>{task.id}</Text>
        <Box flexGrow={1} />
        <Text dimColor>[Esc/Enter to close]</Text>
      </Box>

      {/* Info grid */}
      <Box flexDirection="row" marginBottom={1}>
        <Box width={25}>
          <Text dimColor>Status: </Text>
          <Text>{formatStatus(state?.status || 'pending')} {state?.status || 'pending'}</Text>
        </Box>
        <Box width={20}>
          <Text dimColor>Cost: </Text>
          <Text color="yellow">{state?.cost ? formatCost(state.cost) : '-'}</Text>
        </Box>
        <Box width={20}>
          <Text dimColor>Duration: </Text>
          <Text>{duration > 0 ? formatDuration(duration) : '-'}</Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Project: </Text>
        <Text>{task.project}</Text>
        <Text dimColor>  |  Model: </Text>
        <Text>{task.model}</Text>
        <Text dimColor>  |  Tools: </Text>
        <Text>{task.tools?.join(', ') || '-'}</Text>
      </Box>

      {/* Prompt */}
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Prompt:</Text>
        <Box paddingLeft={1}>
          <Text>{task.prompt.length > 100 ? task.prompt.slice(0, 100) + '...' : task.prompt}</Text>
        </Box>
      </Box>

      {/* Result */}
      <Box flexDirection="column" flexGrow={1}>
        <Text dimColor bold>Result:</Text>
        <Box flexDirection="column" paddingLeft={1}>
          {truncatedResult.map((line, i) => (
            <Text key={i} wrap="truncate">{line}</Text>
          ))}
        </Box>
      </Box>

      {/* Error if any */}
      {state?.error && (
        <ErrorDisplay error={state.error} />
      )}
    </Box>
  );
};

/**
 * Error display with categorization and suggestions
 */
const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => {
  const category = categorizeError(error);
  const info = getErrorInfo(category);

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
      <Box>
        <Text color={info.color as any} bold>{info.label}: </Text>
        <Text color="red">{error.slice(0, 100)}{error.length > 100 ? '...' : ''}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Suggestion: </Text>
        <Text>{info.suggestion}</Text>
      </Box>
    </Box>
  );
};
