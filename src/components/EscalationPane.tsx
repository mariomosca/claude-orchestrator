import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { EscalationRequest, EscalationResponse } from '../engine/runner.js';

interface EscalationPaneProps {
  request: EscalationRequest;
  onRespond: (response: EscalationResponse) => void;
}

const REASON_LABELS: Record<string, string> = {
  architecture_decision: 'Decisione Architetturale',
  breaking_change: 'Modifica Potenzialmente Distruttiva',
  unclear_requirement: 'Requisito Non Chiaro',
  test_failure: 'Test Falliti',
  security_concern: 'Problema di Sicurezza',
  cost_warning: 'Avviso Budget',
  file_conflict: 'Conflitto File',
  dependency_issue: 'Problema Dipendenze',
  other: 'Altro'
};

export const EscalationPane: React.FC<EscalationPaneProps> = ({ request, onRespond }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textResponse, setTextResponse] = useState('');

  // Build options list
  const options = [
    ...(request.options || []),
    { id: 'agent_decide', label: 'Lascia decidere l\'agent' },
    { id: 'skip', label: 'Salta questo task' },
    { id: 'custom', label: 'Risposta personalizzata...' }
  ];

  useInput((input, key) => {
    // If text input is active, don't process other keys
    if (showTextInput) {
      if (key.escape) {
        setShowTextInput(false);
        setTextResponse('');
      }
      return;
    }

    // Navigation
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(Math.min(options.length - 1, selectedIndex + 1));
      return;
    }

    // Number selection (1-9)
    const num = parseInt(input);
    if (num >= 1 && num <= options.length) {
      setSelectedIndex(num - 1);
      handleSelect(num - 1);
      return;
    }

    // Enter to select
    if (key.return) {
      handleSelect(selectedIndex);
      return;
    }
  });

  const handleSelect = (index: number) => {
    const option = options[index];

    if (option.id === 'custom') {
      setShowTextInput(true);
      return;
    }

    if (option.id === 'agent_decide') {
      onRespond({
        action: 'agent_decide'
      });
      return;
    }

    if (option.id === 'skip') {
      onRespond({
        action: 'skip'
      });
      return;
    }

    // Regular option
    onRespond({
      action: 'continue',
      selectedOption: option.id,
      textResponse: option.label
    });
  };

  const handleTextSubmit = (value: string) => {
    if (value.trim()) {
      onRespond({
        action: 'continue',
        textResponse: value.trim()
      });
    }
    setShowTextInput(false);
    setTextResponse('');
  };

  const reasonLabel = REASON_LABELS[request.reason] || request.reason;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">DECISION REQUIRED </Text>
        <Text dimColor>[{request.taskId}]</Text>
      </Box>

      {/* Reason */}
      <Box marginBottom={1}>
        <Text dimColor>Tipo: </Text>
        <Text color="cyan">{reasonLabel}</Text>
      </Box>

      {/* Question */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{request.question}</Text>
      </Box>

      {/* Context if any */}
      {request.context && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
          <Text dimColor>{request.context}</Text>
        </Box>
      )}

      {/* Options */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor bold>Opzioni:</Text>
        {options.map((opt, i) => {
          const isSelected = i === selectedIndex;
          const prefix = isSelected ? '>' : ' ';
          const num = i + 1;
          const recommended = (opt as { recommended?: boolean }).recommended ? ' (consigliato)' : '';

          return (
            <Box key={opt.id} paddingLeft={1}>
              <Text
                color={isSelected ? 'yellow' : undefined}
                bold={isSelected}
                inverse={isSelected}
              >
                {prefix} [{num}] {opt.label}{recommended}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Text input for custom response */}
      {showTextInput && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>La tua risposta (Esc per annullare):</Text>
          <Box paddingLeft={1}>
            <Text color="green">&gt; </Text>
            <TextInput
              value={textResponse}
              onChange={setTextResponse}
              onSubmit={handleTextSubmit}
            />
          </Box>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>
          [1-{options.length}] Seleziona | [Enter] Conferma | [Esc] Annulla input
        </Text>
      </Box>
    </Box>
  );
};
