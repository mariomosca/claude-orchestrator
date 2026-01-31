#!/usr/bin/env node

import { parseArgs } from 'util';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadTaskFile, validateBatch, type ParsedTask } from './engine/parser.js';
import { analyzeDAG } from './engine/dag.js';
import { loadBatchState, getBatchStats } from './engine/state.js';
import { QueueManager, resumeBatch } from './engine/queue.js';
import type { TaskState } from './types/task.js';
import { formatCost, formatDuration, formatStatus } from './utils/format.js';

const HELP = `
claude-orchestrator - Multi-project task orchestrator

Usage:
  claude-orchestrator run <yaml-file>     Run a task batch
  claude-orchestrator resume <state-file> Resume interrupted batch
  claude-orchestrator validate <yaml-file> Validate YAML and show DAG
  claude-orchestrator status <state-file>  Show batch status

Options:
  --max-concurrent <n>  Override max concurrent tasks
  --dry-run             Parse and validate only
  --help                Show this help

Examples:
  claude-orchestrator run tasks/morning-sprint.yaml
  claude-orchestrator resume state/2026-01-31-sprint.state.json
  claude-orchestrator validate tasks/example.yaml
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'max-concurrent': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false }
    }
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const command = positionals[0];
  const filePath = positionals[1];

  if (!filePath) {
    console.error('Error: Missing file path');
    console.log(HELP);
    process.exit(1);
  }

  const absolutePath = resolve(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'run':
        await runCommand(absolutePath, values);
        break;

      case 'resume':
        await resumeCommand(absolutePath, values);
        break;

      case 'validate':
        await validateCommand(absolutePath);
        break;

      case 'status':
        await statusCommand(absolutePath);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function runCommand(yamlPath: string, options: Record<string, unknown>) {
  console.log(`Loading: ${yamlPath}`);

  const batch = await loadTaskFile(yamlPath);

  // Validate
  const errors = validateBatch(batch);
  if (errors.length > 0) {
    console.error('Validation errors:');
    errors.forEach((e: string) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\nBatch: ${batch.name}`);
  console.log(`Tasks: ${batch.tasks.length}`);
  console.log(`Max Concurrent: ${batch.maxConcurrent}`);

  // Show DAG
  const dag = analyzeDAG(batch.tasks);
  console.log(`\nExecution Levels:`);
  dag.levels.forEach((level: ParsedTask[], i: number) => {
    console.log(`  Level ${i}: ${level.map((t: ParsedTask) => t.id).join(', ')}`);
  });

  if (options['dry-run']) {
    console.log('\n[Dry run - not executing]');
    return;
  }

  console.log('\n--- Starting Execution ---\n');

  const manager = new QueueManager(batch, yamlPath, {
    maxConcurrent: options['max-concurrent']
      ? parseInt(options['max-concurrent'] as string, 10)
      : undefined
  });

  // Setup event handlers
  manager.on('task_started', (taskId) => {
    console.log(`${formatStatus('running')} Started: ${taskId}`);
  });

  manager.on('task_tool_use', (taskId, tool) => {
    console.log(`  [${taskId}] Using: ${tool}`);
  });

  manager.on('task_completed', (taskId, state) => {
    console.log(`${formatStatus('completed')} Completed: ${taskId} (${formatCost(state.cost)})`);
  });

  manager.on('task_failed', (taskId, error) => {
    console.log(`${formatStatus('failed')} Failed: ${taskId}`);
    console.log(`  Error: ${error}`);
  });

  manager.on('escalation', (request) => {
    console.log(`\n⚠️  ESCALATION from ${request.taskId}`);
    console.log(`   ${request.question}`);
    if (request.options) {
      request.options.forEach((opt: { id: string; label: string }, i: number) => {
        console.log(`   [${i + 1}] ${opt.label}`);
      });
    }
    // TODO: Interactive prompt for response
    // For now, let agent decide
    manager.resolveEscalation(request.taskId, { action: 'agent_decide' });
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n\nCancelling...');
    manager.cancelAll();
    await manager.saveState();
    console.log('State saved. Use "resume" command to continue.');
    process.exit(130);
  });

  // Run
  const finalState = await manager.start();

  // Summary
  const stats = getBatchStats(finalState);
  console.log('\n--- Summary ---');
  console.log(`Status: ${finalState.status}`);
  console.log(`Completed: ${stats.completed}/${stats.total}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Total Cost: ${formatCost(stats.totalCost)}`);

  if (finalState.status === 'failed') {
    process.exit(1);
  }
}

async function resumeCommand(statePath: string, options: Record<string, unknown>) {
  console.log(`Loading state: ${statePath}`);

  const savedState = await loadBatchState(statePath);

  // Need to reload the YAML to get task definitions
  if (!existsSync(savedState.yamlPath)) {
    console.error(`Original YAML not found: ${savedState.yamlPath}`);
    process.exit(1);
  }

  const batch = await loadTaskFile(savedState.yamlPath);

  console.log(`\nResuming: ${savedState.batchName}`);
  const stats = getBatchStats(savedState);
  console.log(`Progress: ${stats.completed}/${stats.total} completed, ${stats.failed} failed`);

  const manager = await resumeBatch(batch, savedState, {
    maxConcurrent: options['max-concurrent']
      ? parseInt(options['max-concurrent'] as string, 10)
      : undefined
  });

  // Same event handlers as run
  manager.on('task_started', (taskId) => {
    console.log(`${formatStatus('running')} Started: ${taskId}`);
  });

  manager.on('task_completed', (taskId, state) => {
    console.log(`${formatStatus('completed')} Completed: ${taskId} (${formatCost(state.cost)})`);
  });

  manager.on('task_failed', (taskId, error) => {
    console.log(`${formatStatus('failed')} Failed: ${taskId}: ${error}`);
  });

  process.on('SIGINT', async () => {
    console.log('\n\nCancelling...');
    manager.cancelAll();
    await manager.saveState();
    process.exit(130);
  });

  const finalState = await manager.start();
  const finalStats = getBatchStats(finalState);

  console.log('\n--- Summary ---');
  console.log(`Status: ${finalState.status}`);
  console.log(`Completed: ${finalStats.completed}/${finalStats.total}`);
  console.log(`Total Cost: ${formatCost(finalStats.totalCost)}`);
}

async function validateCommand(yamlPath: string) {
  console.log(`Validating: ${yamlPath}`);

  const batch = await loadTaskFile(yamlPath);

  const errors = validateBatch(batch);
  if (errors.length > 0) {
    console.error('\nValidation errors:');
    errors.forEach((e: string) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  console.log('\n✓ YAML is valid');
  console.log(`\nBatch: ${batch.name}`);
  console.log(`Tasks: ${batch.tasks.length}`);
  console.log(`Max Concurrent: ${batch.maxConcurrent}`);
  console.log(`Default Budget: ${formatCost(batch.defaultBudget)}`);

  const dag = analyzeDAG(batch.tasks);

  console.log(`\nEntry Points: ${dag.entryPoints.map(t => t.id).join(', ')}`);
  console.log(`Exit Points: ${dag.exitPoints.map(t => t.id).join(', ')}`);

  console.log(`\nExecution Levels:`);
  dag.levels.forEach((level: ParsedTask[], i: number) => {
    const tasks = level.map((t: ParsedTask) => {
      const deps = t.dependsOn?.length ? ` (← ${t.dependsOn.join(', ')})` : '';
      return `${t.id}${deps}`;
    });
    console.log(`  ${i}: ${tasks.join(', ')}`);
  });

  console.log(`\nTask Details:`);
  for (const task of batch.tasks) {
    console.log(`  ${task.id}:`);
    console.log(`    Project: ${task.project}`);
    console.log(`    CWD: ${task.cwd}`);
    console.log(`    Model: ${task.model}`);
    console.log(`    Budget: ${formatCost(task.budget ?? batch.defaultBudget)}`);
    console.log(`    Tools: ${task.tools?.join(', ')}`);
  }
}

async function statusCommand(statePath: string) {
  const state = await loadBatchState(statePath);
  const stats = getBatchStats(state);

  console.log(`Batch: ${state.batchName}`);
  console.log(`ID: ${state.batchId}`);
  console.log(`Status: ${state.status}`);
  console.log(`Started: ${state.startedAt.toISOString()}`);
  if (state.completedAt) {
    console.log(`Completed: ${state.completedAt.toISOString()}`);
    const duration = state.completedAt.getTime() - state.startedAt.getTime();
    console.log(`Duration: ${formatDuration(duration)}`);
  }

  console.log(`\nProgress: ${stats.completed}/${stats.total}`);
  console.log(`Running: ${stats.running}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Pending: ${stats.pending}`);
  console.log(`Total Cost: ${formatCost(stats.totalCost)}`);

  console.log(`\nTasks:`);
  for (const [taskId, taskState] of Object.entries(state.tasks) as [string, TaskState][]) {
    const icon = formatStatus(taskState.status);
    const cost = taskState.cost > 0 ? ` (${formatCost(taskState.cost)})` : '';
    const error = taskState.error ? ` - ${taskState.error}` : '';
    console.log(`  ${icon} ${taskId}${cost}${error}`);
  }
}

main();
