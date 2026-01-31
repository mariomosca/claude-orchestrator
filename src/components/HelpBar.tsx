import React from 'react';
import { Box, Text } from 'ink';

interface HelpBarProps {
  isPaused?: boolean;
}

const shortcuts = [
  { key: 'Tab', action: 'Switch Pane' },
  { key: 'Space', action: 'Pause/Resume' },
  { key: 'Enter', action: 'Details' },
  { key: 'L', action: 'Full Log' },
  { key: 'S', action: 'Stats' },
  { key: 'R', action: 'Retry' },
  { key: 'C', action: 'Cancel' },
  { key: 'Q', action: 'Quit' },
];

export const HelpBar: React.FC<HelpBarProps> = ({ isPaused }) => {
  return (
    <Box paddingX={1} justifyContent="center">
      {shortcuts.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <Text dimColor>  </Text>}
          <Text color="cyan">[{s.key}]</Text>
          <Text dimColor> {s.action}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
};
