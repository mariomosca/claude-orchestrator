import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { ParsedTask } from '../engine/parser.js';

export interface TaskPlan {
  task: ParsedTask;
  included: boolean;
  analysis?: string;
  analyzing?: boolean;
}

interface PlanningPaneProps {
  tasks: TaskPlan[];
  onApprove: (includedTaskIds: string[]) => void;
  onEditTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onCancel: () => void;
  isAnalyzing: boolean;
}

export const PlanningPane: React.FC<PlanningPaneProps> = ({
  tasks,
  onApprove,
  onEditTask,
  onToggleTask,
  onCancel,
  isAnalyzing,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const includedCount = tasks.filter(t => t.included).length;

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(Math.min(tasks.length - 1, selectedIndex + 1));
      return;
    }

    // Expand/collapse with Enter
    if (key.return && !key.ctrl) {
      const task = tasks[selectedIndex];
      if (task) {
        setExpandedTask(expandedTask === task.task.id ? null : task.task.id);
      }
      return;
    }

    // Toggle include/exclude with X or Space
    if (input === 'x' || input === 'X' || input === ' ') {
      const task = tasks[selectedIndex];
      if (task) {
        onToggleTask(task.task.id);
      }
      return;
    }

    // Edit with E
    if (input === 'e' || input === 'E') {
      const task = tasks[selectedIndex];
      if (task) {
        onEditTask(task.task.id);
      }
      return;
    }

    // Approve and run with A or Ctrl+Enter
    if (input === 'a' || input === 'A' || (key.return && key.ctrl)) {
      const includedIds = tasks.filter(t => t.included).map(t => t.task.id);
      if (includedIds.length > 0) {
        onApprove(includedIds);
      }
      return;
    }

    // Cancel with Q or Escape
    if (input === 'q' || input === 'Q' || key.escape) {
      onCancel();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">
          ═══ PLAN MODE ═══
        </Text>
        <Text dimColor>
          Review tasks before execution. {includedCount}/{tasks.length} tasks selected.
        </Text>
        {isAnalyzing && (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" /> Analyzing tasks with AI...
            </Text>
          </Box>
        )}
      </Box>

      {/* Task list */}
      <Box flexDirection="column" marginBottom={1}>
        {tasks.map((taskPlan, index) => {
          const isSelected = index === selectedIndex;
          const isExpanded = expandedTask === taskPlan.task.id;
          const { task, included, analysis, analyzing } = taskPlan;

          return (
            <Box key={task.id} flexDirection="column" marginBottom={isExpanded ? 1 : 0}>
              {/* Task row */}
              <Box>
                <Text color={isSelected ? 'yellow' : undefined} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                </Text>
                <Text color={included ? 'green' : 'gray'}>
                  {included ? '☑' : '☐'}
                </Text>
                <Text color={isSelected ? 'yellow' : undefined} bold={isSelected}>
                  {' '}{task.id}
                </Text>
                <Text dimColor> ({task.project})</Text>
                {task.dependsOn && task.dependsOn.length > 0 && (
                  <Text dimColor> ← {task.dependsOn.join(', ')}</Text>
                )}
                {analyzing && (
                  <Text color="yellow"> <Spinner type="dots" /></Text>
                )}
              </Box>

              {/* Expanded details */}
              {isExpanded && (
                <Box flexDirection="column" paddingLeft={4} marginTop={0}>
                  {/* Prompt preview */}
                  <Box flexDirection="column" marginBottom={1}>
                    <Text dimColor bold>Prompt:</Text>
                    <Box paddingLeft={1}>
                      <Text wrap="wrap">
                        {task.prompt.length > 200
                          ? task.prompt.slice(0, 200) + '...'
                          : task.prompt}
                      </Text>
                    </Box>
                  </Box>

                  {/* AI Analysis */}
                  {analysis && (
                    <Box flexDirection="column" marginBottom={1}>
                      <Text color="cyan" bold>AI Analysis:</Text>
                      <Box paddingLeft={1}>
                        <Text color="white" wrap="wrap">{analysis}</Text>
                      </Box>
                    </Box>
                  )}

                  {/* Task details */}
                  <Box>
                    <Text dimColor>
                      Budget: ${task.budget?.toFixed(2)} | Model: {task.model} | Tools: {task.tools?.slice(0, 3).join(', ')}
                      {task.tools && task.tools.length > 3 ? '...' : ''}
                    </Text>
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Help bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="cyan">[Enter]</Text>
        <Text dimColor> Expand </Text>
        <Text color="cyan">[X/Space]</Text>
        <Text dimColor> Toggle </Text>
        <Text color="cyan">[E]</Text>
        <Text dimColor> Edit </Text>
        <Text color="green">[A]</Text>
        <Text dimColor> Approve & Run </Text>
        <Text color="red">[Q]</Text>
        <Text dimColor> Cancel</Text>
      </Box>
    </Box>
  );
};
