import React from 'react';
import { Box, Text } from 'ink';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary to catch React rendering errors in the TUI
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('TUI Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="red"
          paddingX={2}
          paddingY={1}
        >
          <Text color="red" bold>TUI Error</Text>
          <Box marginTop={1}>
            <Text wrap="wrap">
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

/**
 * Error type categorization for better UX
 */
export type ErrorCategory =
  | 'sdk_error'      // Claude SDK error
  | 'timeout'        // Task timeout
  | 'budget'         // Budget exceeded
  | 'network'        // Network/connection error
  | 'validation'     // Invalid input/config
  | 'permission'     // File/directory permission
  | 'cancelled'      // User cancelled
  | 'unknown';       // Unknown error

/**
 * Categorize an error message
 */
export function categorizeError(error: string): ErrorCategory {
  const lower = error.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout';
  }
  if (lower.includes('budget') || lower.includes('cost') || lower.includes('limit exceeded')) {
    return 'budget';
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('econnrefused') || lower.includes('fetch')) {
    return 'network';
  }
  if (lower.includes('permission') || lower.includes('eacces') || lower.includes('eperm')) {
    return 'permission';
  }
  if (lower.includes('validation') || lower.includes('invalid') || lower.includes('required')) {
    return 'validation';
  }
  if (lower.includes('cancel') || lower.includes('abort')) {
    return 'cancelled';
  }
  if (lower.includes('sdk') || lower.includes('claude') || lower.includes('anthropic')) {
    return 'sdk_error';
  }

  return 'unknown';
}

/**
 * Get error category display info
 */
export function getErrorInfo(category: ErrorCategory): { label: string; color: string; suggestion: string } {
  switch (category) {
    case 'timeout':
      return {
        label: 'Timeout',
        color: 'yellow',
        suggestion: 'Task took too long. Try breaking it into smaller steps or increasing the budget.'
      };
    case 'budget':
      return {
        label: 'Budget Exceeded',
        color: 'yellow',
        suggestion: 'Task exceeded the cost limit. Increase the budget in your YAML file.'
      };
    case 'network':
      return {
        label: 'Network Error',
        color: 'magenta',
        suggestion: 'Check your internet connection and try again.'
      };
    case 'permission':
      return {
        label: 'Permission Denied',
        color: 'red',
        suggestion: 'Check file/directory permissions for the project path.'
      };
    case 'validation':
      return {
        label: 'Validation Error',
        color: 'red',
        suggestion: 'Check your task configuration and prompt.'
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: 'gray',
        suggestion: 'Task was cancelled by user. Press R to retry.'
      };
    case 'sdk_error':
      return {
        label: 'SDK Error',
        color: 'red',
        suggestion: 'Claude SDK error. Check if claude-code is properly installed and authenticated.'
      };
    default:
      return {
        label: 'Error',
        color: 'red',
        suggestion: 'An unexpected error occurred. Check the logs for details.'
      };
  }
}
