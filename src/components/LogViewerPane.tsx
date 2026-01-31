import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TaskState } from '../types/task.js';
import type { ParsedTask } from '../engine/parser.js';
import { formatCost, formatDuration, formatStatus } from '../utils/format.js';
import { readTaskLog } from '../engine/state.js';

interface LogViewerPaneProps {
  task: ParsedTask & { state?: TaskState };
  batchId: string;
  onClose: () => void;
}

export const LogViewerPane: React.FC<LogViewerPaneProps> = ({ task, batchId, onClose }) => {
  const [logContent, setLogContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState(24);

  const state = task.state;
  const duration = state?.completedAt && state?.startedAt
    ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
    : 0;

  // Load log content
  useEffect(() => {
    const loadLog = async () => {
      setLoading(true);
      const content = await readTaskLog(batchId, task.id);
      setLogContent(content);
      setLoading(false);
    };
    loadLog();
  }, [batchId, task.id]);

  // Get terminal height
  useEffect(() => {
    if (process.stdout.rows) {
      setTerminalHeight(process.stdout.rows);
    }
  }, []);

  // Calculate visible lines
  const headerHeight = 6; // Header section
  const footerHeight = 2; // Help line
  const visibleHeight = Math.max(5, terminalHeight - headerHeight - footerHeight);

  // Build display content
  const displayContent = logContent || state?.result || 'No log content available';
  const lines = displayContent.split('\n');
  const totalLines = lines.length;
  const maxScroll = Math.max(0, totalLines - visibleHeight);

  // Handle scroll
  useInput((input, key) => {
    if (key.escape || key.return) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
      return;
    }

    if (key.pageUp || input === 'u' || input === 'U') {
      setScrollOffset(prev => Math.max(0, prev - visibleHeight));
      return;
    }

    if (key.pageDown || input === 'd' || input === 'D') {
      setScrollOffset(prev => Math.min(maxScroll, prev + visibleHeight));
      return;
    }

    // Home
    if (input === 'g') {
      setScrollOffset(0);
      return;
    }

    // End
    if (input === 'G') {
      setScrollOffset(maxScroll);
      return;
    }
  });

  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
      width="100%"
      height="100%"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Log Viewer: </Text>
        <Text bold>{task.id}</Text>
        <Box flexGrow={1} />
        <Text dimColor>
          Line {scrollOffset + 1}-{Math.min(scrollOffset + visibleHeight, totalLines)} of {totalLines}
        </Text>
      </Box>

      {/* Info bar */}
      <Box marginBottom={1}>
        <Text dimColor>Status: </Text>
        <Text>{formatStatus(state?.status || 'pending')} {state?.status || 'pending'}</Text>
        <Text>  </Text>
        <Text dimColor>Cost: </Text>
        <Text color="yellow">{state?.cost ? formatCost(state.cost) : '-'}</Text>
        <Text>  </Text>
        <Text dimColor>Duration: </Text>
        <Text>{duration > 0 ? formatDuration(duration) : '-'}</Text>
      </Box>

      {/* Log content with scroll */}
      <Box flexDirection="column" flexGrow={1}>
        {loading ? (
          <Text dimColor>Loading log...</Text>
        ) : (
          visibleLines.map((line, i) => (
            <Text key={i + scrollOffset} wrap="truncate">
              <Text dimColor>{String(scrollOffset + i + 1).padStart(4, ' ')} </Text>
              {formatLogLine(line)}
            </Text>
          ))
        )}
      </Box>

      {/* Scroll indicator */}
      {totalLines > visibleHeight && (
        <Box>
          {scrollOffset > 0 && <Text dimColor>^^ More above</Text>}
          <Box flexGrow={1} />
          {scrollOffset < maxScroll && <Text dimColor>vv More below</Text>}
        </Box>
      )}

      {/* Help */}
      <Box borderStyle="single" borderColor="gray" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text dimColor>
          [Esc/Enter] Close  [Up/Down] Scroll  [U/D] Page  [g/G] Top/Bottom
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Format log line with syntax highlighting
 */
function formatLogLine(line: string): React.ReactNode {
  // Timestamp pattern
  if (line.startsWith('[')) {
    const match = line.match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      return (
        <>
          <Text dimColor>[{match[1]}]</Text>
          <Text> {match[2]}</Text>
        </>
      );
    }
  }

  // Error lines
  if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
    return <Text color="red">{line}</Text>;
  }

  // Success lines
  if (line.toLowerCase().includes('success') || line.toLowerCase().includes('completed')) {
    return <Text color="green">{line}</Text>;
  }

  // Tool use lines
  if (line.includes('Using:') || line.includes('tool_use')) {
    return <Text color="cyan">{line}</Text>;
  }

  return <Text>{line}</Text>;
}
