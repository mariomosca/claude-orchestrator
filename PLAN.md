# Claude Orchestrator

> TUI multi-project task orchestrator powered by Claude Agent SDK

## Vision

Gestire task su multipli progetti da un punto centrale, con:
- Task list in YAML con dipendenze
- Esecuzione parallela/sequenziale automatica
- TUI per monitoraggio real-time
- Persistenza stato per resume dopo interruzioni
- **Escalation flow**: Agent → Orchestrator → User
- **Project context**: Raccolta e conservazione learnings
- **Agent guardrails**: Istruzioni per evitare regressioni

## Feature Documentation

| Feature | Doc | Status |
|---------|-----|--------|
| YAML Parser | src/engine/parser.ts | ✅ Done |
| DAG Resolver | src/engine/dag.ts | ✅ Done |
| Task Runner | src/engine/runner.ts | ✅ Done |
| Queue Manager | src/engine/queue.ts | ✅ Done |
| State Persistence | src/engine/state.ts | ✅ Done |
| CLI | src/cli.ts | ✅ Done |
| Escalation Flow | [docs/features/escalation-flow.md](docs/features/escalation-flow.md) | ✅ Done (TUI + handler) |
| Project Context | [docs/features/project-context.md](docs/features/project-context.md) | ✅ Done (detection + injection) |
| Agent Guardrails | [docs/features/agent-guardrails.md](docs/features/agent-guardrails.md) | ✅ Implemented in runner.ts |
| TUI Dashboard | src/components/ | ✅ Done |
| Results Command | src/cli.ts | ✅ Done |
| AI Report | src/cli.ts | ✅ Done |

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| TUI | Ink + React | Familiare, component-based, flexbox layout |
| Runtime | Node.js + TypeScript | Type safety, async/await native |
| Agent | @anthropic-ai/claude-agent-sdk | Official SDK, session management, streaming |
| Config | YAML | Human-readable, supporta dipendenze |
| State | JSON files | Semplice, ispezionabile, no deps |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TUI Layer (Ink)                         │
├─────────────┬─────────────────────┬─────────────────────────────┤
│  TaskQueue  │   RunningTasks      │        LogPane              │
│             │                     │                             │
│  ▶ task-1   │  ⟳ task-3          │  ✓ task-5  $0.12  45s       │
│    task-2   │    journalowl       │  ✓ task-6  $0.08  23s       │
│    task-4   │    "fixing auth..." │  ✗ task-7  error            │
│             │    $0.04 | 23s      │                             │
├─────────────┴─────────────────────┴─────────────────────────────┤
│  Status Bar: Total $0.24 | 3/7 done | ETA ~5min                 │
├─────────────────────────────────────────────────────────────────┤
│  [Space] Pause  [Enter] Details  [R] Retry  [Q] Quit            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Engine                          │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ YAML Parser │  │ DAG Solver  │  │    Queue Manager        │  │
│  │             │  │             │  │                         │  │
│  │ tasks.yaml  │─▶│ Topological │─▶│ maxConcurrent: 3        │  │
│  │ → Task[]    │  │ Sort        │  │ ready → running → done  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                              │                  │
│                                              ▼                  │
│                          ┌─────────────────────────────────┐    │
│                          │      Session Manager            │    │
│                          │                                 │    │
│                          │  • Session ID persistence       │    │
│                          │  • Resume interrupted tasks     │    │
│                          │  • Context sharing (optional)   │    │
│                          └─────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Claude Agent SDK Layer                          │
│                                                                 │
│  query({                                                        │
│    prompt: task.prompt,                                         │
│    options: {                                                   │
│      cwd: task.cwd,                     // Project directory    │
│      resume: task.sessionId,            // Resume if exists     │
│      settingSources: ["project"],       // Load CLAUDE.md       │
│      allowedTools: task.tools,          // Per-task permissions │
│      maxBudgetUsd: task.budget,         // Cost limit           │
│      abortController: controller,       // For cancellation     │
│      includePartialMessages: true       // For progress         │
│    }                                                            │
│  })                                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Structures

### Task Definition (YAML)

```yaml
# tasks/2026-01-31-sprint.yaml
name: "Morning Sprint"
maxConcurrent: 3
defaultBudget: 3.00
defaultTools: [Read, Edit, Glob, Grep]

tasks:
  # Task semplice
  - id: journalowl-api-fix
    project: journalowl
    cwd: ~/Desktop/Projects/01-Revenue-Active/journalowl
    prompt: |
      Fix the authentication timeout bug in /api/auth/refresh.
      The token refresh is failing after 30 minutes.
    tools: [Read, Edit, Bash]
    budget: 3.00

  # Task con dipendenza (sequenziale)
  - id: journalowl-ui-update
    project: journalowl
    cwd: ~/Desktop/Projects/01-Revenue-Active/journalowl
    prompt: |
      Update the error UI to show a user-friendly message
      when the refresh token expires.
    dependsOn: [journalowl-api-fix]
    budget: 2.00

  # Task deploy (dipende da UI)
  - id: journalowl-deploy
    project: journalowl
    cwd: ~/Desktop/Projects/01-Revenue-Active/journalowl
    prompt: |
      Run the test suite. If all tests pass, deploy to production.
    tools: [Bash]
    dependsOn: [journalowl-ui-update]
    budget: 1.00

  # Task parallelo (nessuna dipendenza)
  - id: kanv-export-feature
    project: kanv-ai
    cwd: ~/Desktop/Projects/01-Revenue-Active/kanv-ai
    prompt: |
      Add PDF export feature to the canvas.
      Use jsPDF library.
    tools: [Read, Edit, Write, Bash]
    budget: 5.00
```

### State Persistence (JSON)

```json
// state/2026-01-31-sprint.state.json
{
  "batchId": "2026-01-31-sprint",
  "startedAt": "2026-01-31T08:00:00Z",
  "status": "running",
  "totalCost": 2.45,
  "tasks": {
    "journalowl-api-fix": {
      "status": "completed",
      "sessionId": "sess_abc123",
      "startedAt": "2026-01-31T08:00:00Z",
      "completedAt": "2026-01-31T08:02:15Z",
      "cost": 1.23,
      "result": "Fixed timeout bug by updating token refresh logic"
    },
    "journalowl-ui-update": {
      "status": "running",
      "sessionId": "sess_def456",
      "startedAt": "2026-01-31T08:02:20Z",
      "cost": 0.45
    },
    "journalowl-deploy": {
      "status": "pending",
      "blockedBy": ["journalowl-ui-update"]
    },
    "kanv-export-feature": {
      "status": "running",
      "sessionId": "sess_ghi789",
      "startedAt": "2026-01-31T08:00:05Z",
      "cost": 0.77
    }
  }
}
```

### Log Storage

```
logs/
├── 2026-01-31-sprint/
│   ├── journalowl-api-fix.log      # Full streaming output
│   ├── journalowl-api-fix.json     # Structured result
│   ├── journalowl-ui-update.log
│   └── ...
```

## TypeScript Interfaces

```typescript
// types/task.ts
export interface TaskDefinition {
  id: string;
  project: string;
  cwd: string;
  prompt: string;
  tools?: string[];
  budget?: number;
  dependsOn?: string[];
}

export interface TaskBatch {
  name: string;
  maxConcurrent: number;
  defaultBudget: number;
  defaultTools: string[];
  tasks: TaskDefinition[];
}

export type TaskStatus =
  | 'pending'
  | 'blocked'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskState {
  status: TaskStatus;
  sessionId?: string;
  startedAt?: Date;
  completedAt?: Date;
  cost: number;
  result?: string;
  error?: string;
  blockedBy?: string[];
}

export interface BatchState {
  batchId: string;
  startedAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalCost: number;
  tasks: Record<string, TaskState>;
}

// types/events.ts
export interface TaskEvent {
  type: 'started' | 'progress' | 'tool_use' | 'completed' | 'failed';
  taskId: string;
  timestamp: Date;
  data: unknown;
}

export interface ProgressEvent {
  taskId: string;
  text: string;
  cost: number;
  elapsed: number;
}
```

## Components (Ink)

### Dashboard Layout

```tsx
// src/components/Dashboard.tsx
import React from 'react';
import { Box } from 'ink';
import { TaskQueue } from './TaskQueue';
import { RunningPane } from './RunningPane';
import { LogPane } from './LogPane';
import { StatusBar } from './StatusBar';
import { HelpBar } from './HelpBar';

export const Dashboard: React.FC<{ state: BatchState }> = ({ state }) => {
  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1}>
        <TaskQueue tasks={getPendingTasks(state)} />
        <RunningPane tasks={getRunningTasks(state)} />
        <LogPane tasks={getCompletedTasks(state)} />
      </Box>
      <StatusBar state={state} />
      <HelpBar />
    </Box>
  );
};
```

### Key Bindings

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume orchestrator |
| `Enter` | Show task details (full log) |
| `Tab` | Cycle focus between panes |
| `R` | Retry failed task |
| `C` | Cancel running task |
| `Q` | Quit (with confirmation) |
| `?` | Toggle help |

## Engine Components

### YAML Parser

```typescript
// src/engine/parser.ts
import { parse } from 'yaml';
import { TaskBatch } from '../types/task';
import { expandPath } from '../utils/path';

export function parseTaskFile(content: string): TaskBatch {
  const raw = parse(content);

  return {
    name: raw.name,
    maxConcurrent: raw.maxConcurrent ?? 3,
    defaultBudget: raw.defaultBudget ?? 5.0,
    defaultTools: raw.defaultTools ?? ['Read', 'Edit'],
    tasks: raw.tasks.map(task => ({
      ...task,
      cwd: expandPath(task.cwd), // ~/... → /Users/...
      tools: task.tools ?? raw.defaultTools,
      budget: task.budget ?? raw.defaultBudget
    }))
  };
}
```

### DAG Resolver

```typescript
// src/engine/dag.ts
import { TaskDefinition } from '../types/task';

export function topologicalSort(tasks: TaskDefinition[]): TaskDefinition[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Build graph
  for (const task of tasks) {
    graph.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      graph.get(dep)?.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = tasks.filter(t => (inDegree.get(t.id) ?? 0) === 0);
  const result: TaskDefinition[] = [];

  while (queue.length > 0) {
    const task = queue.shift()!;
    result.push(task);

    for (const next of graph.get(task.id) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      if (inDegree.get(next) === 0) {
        queue.push(tasks.find(t => t.id === next)!);
      }
    }
  }

  if (result.length !== tasks.length) {
    throw new Error('Circular dependency detected');
  }

  return result;
}

export function getReadyTasks(
  tasks: TaskDefinition[],
  completed: Set<string>
): TaskDefinition[] {
  return tasks.filter(task => {
    if (completed.has(task.id)) return false;
    const deps = task.dependsOn ?? [];
    return deps.every(d => completed.has(d));
  });
}
```

### Claude SDK Runner

```typescript
// src/engine/runner.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { TaskDefinition, TaskState, TaskEvent } from '../types';
import { EventEmitter } from 'events';

export class TaskRunner extends EventEmitter {
  private abortController: AbortController;

  constructor() {
    super();
    this.abortController = new AbortController();
  }

  async run(
    task: TaskDefinition,
    existingSessionId?: string
  ): Promise<TaskState> {
    const startedAt = new Date();
    let sessionId: string | undefined = existingSessionId;
    let cost = 0;
    let result = '';

    this.emit('started', { taskId: task.id, startedAt });

    try {
      const queryResult = query({
        prompt: task.prompt,
        options: {
          cwd: task.cwd,
          resume: sessionId,
          settingSources: ["project"], // Loads CLAUDE.md
          allowedTools: task.tools,
          maxBudgetUsd: task.budget,
          abortController: this.abortController,
          includePartialMessages: true
        }
      });

      for await (const message of queryResult) {
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id;
        }

        if (message.type === 'stream_event') {
          this.emit('progress', {
            taskId: task.id,
            event: message.event
          });
        }

        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              this.emit('tool_use', {
                taskId: task.id,
                tool: block.name,
                input: block.input
              });
            }
          }
        }

        if (message.type === 'result') {
          cost = message.total_cost_usd;
          result = message.result || '';

          return {
            status: 'completed',
            sessionId,
            startedAt,
            completedAt: new Date(),
            cost,
            result
          };
        }
      }

      throw new Error('Query ended without result');

    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          status: 'cancelled',
          sessionId,
          startedAt,
          completedAt: new Date(),
          cost
        };
      }

      return {
        status: 'failed',
        sessionId,
        startedAt,
        completedAt: new Date(),
        cost,
        error: error.message
      };
    }
  }

  abort() {
    this.abortController.abort();
  }
}
```

### Queue Manager

```typescript
// src/engine/queue.ts
import { TaskDefinition, BatchState, TaskState } from '../types';
import { TaskRunner } from './runner';
import { getReadyTasks } from './dag';
import { EventEmitter } from 'events';

export class QueueManager extends EventEmitter {
  private runners: Map<string, TaskRunner> = new Map();
  private state: BatchState;
  private maxConcurrent: number;

  constructor(batchId: string, maxConcurrent: number) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.state = {
      batchId,
      startedAt: new Date(),
      status: 'pending',
      totalCost: 0,
      tasks: {}
    };
  }

  async process(tasks: TaskDefinition[]): Promise<BatchState> {
    this.state.status = 'running';
    const completed = new Set<string>();
    const failed = new Set<string>();

    while (completed.size + failed.size < tasks.length) {
      const ready = getReadyTasks(tasks, completed)
        .filter(t => !failed.has(t.id))
        .filter(t => !this.runners.has(t.id));

      // Start tasks up to maxConcurrent
      const available = this.maxConcurrent - this.runners.size;
      const toStart = ready.slice(0, available);

      for (const task of toStart) {
        this.startTask(task);
      }

      // Wait for any task to complete
      if (this.runners.size > 0) {
        const result = await this.waitForAny();

        if (result.status === 'completed') {
          completed.add(result.taskId);
        } else {
          failed.add(result.taskId);
        }

        this.state.totalCost += result.cost;
        this.emit('taskComplete', result);
      }

      // Small delay to prevent tight loop
      await new Promise(r => setTimeout(r, 100));
    }

    this.state.status = failed.size > 0 ? 'failed' : 'completed';
    return this.state;
  }

  private startTask(task: TaskDefinition): void {
    const runner = new TaskRunner();
    this.runners.set(task.id, runner);

    runner.on('progress', (e) => this.emit('progress', e));
    runner.on('tool_use', (e) => this.emit('tool_use', e));

    const existingState = this.state.tasks[task.id];

    runner.run(task, existingState?.sessionId)
      .then(result => {
        this.state.tasks[task.id] = result;
        this.runners.delete(task.id);
      });

    this.state.tasks[task.id] = {
      status: 'running',
      startedAt: new Date(),
      cost: 0
    };
  }

  private async waitForAny(): Promise<{ taskId: string; status: string; cost: number }> {
    return new Promise(resolve => {
      const check = () => {
        for (const [taskId, state] of Object.entries(this.state.tasks)) {
          if (state.status === 'completed' || state.status === 'failed') {
            if (!this.runners.has(taskId)) {
              resolve({ taskId, status: state.status, cost: state.cost });
              return;
            }
          }
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  getState(): BatchState {
    return { ...this.state };
  }

  cancelAll(): void {
    for (const runner of this.runners.values()) {
      runner.abort();
    }
  }
}
```

## File Structure

```
claude-orchestrator/
├── PLAN.md                      # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx                # Entry point
│   ├── cli.ts                   # CLI argument parsing
│   ├── components/
│   │   ├── Dashboard.tsx        # Main layout
│   │   ├── TaskQueue.tsx        # Pending tasks pane
│   │   ├── RunningPane.tsx      # Running tasks pane
│   │   ├── LogPane.tsx          # Completed/failed pane
│   │   ├── StatusBar.tsx        # Total cost, progress
│   │   ├── HelpBar.tsx          # Keyboard shortcuts
│   │   └── TaskDetail.tsx       # Full log modal
│   ├── engine/
│   │   ├── parser.ts            # YAML → TaskBatch
│   │   ├── dag.ts               # Dependency resolution
│   │   ├── runner.ts            # Claude SDK wrapper
│   │   ├── queue.ts             # Concurrency manager
│   │   └── state.ts             # JSON persistence
│   ├── hooks/
│   │   ├── useKeyboard.ts       # Keyboard handling
│   │   ├── useTasks.ts          # Task state management
│   │   └── useFocus.ts          # Pane focus
│   ├── types/
│   │   ├── task.ts              # Task interfaces
│   │   └── events.ts            # Event types
│   └── utils/
│       ├── path.ts              # Path expansion
│       ├── format.ts            # Cost/time formatting
│       └── logger.ts            # File logging
├── tasks/                       # Task YAML files
│   └── example.yaml
├── state/                       # Persistent state
│   └── .gitkeep
└── logs/                        # Execution logs
    └── .gitkeep
```

## Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
    "ink": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.0.0",
    "yaml": "^2.0.0",
    "chalk": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

## Usage

```bash
# Run a task batch
npx claude-orchestrator run tasks/2026-01-31-sprint.yaml

# Resume interrupted batch
npx claude-orchestrator resume state/2026-01-31-sprint.state.json

# Dry run (validate YAML, show DAG)
npx claude-orchestrator validate tasks/2026-01-31-sprint.yaml

# Show batch status
npx claude-orchestrator status state/2026-01-31-sprint.state.json
```

## Claude SDK Key Features Used

| Feature | Purpose |
|---------|---------|
| `cwd` option | Execute in specific project directory |
| `resume` option | Continue interrupted session |
| `settingSources: ["project"]` | Auto-load CLAUDE.md |
| `allowedTools` | Per-task tool permissions |
| `maxBudgetUsd` | Cost limit per task |
| `abortController` | Graceful cancellation |
| `includePartialMessages` | Real-time progress |
| Session ID | Persistence for resume |

## Decisions Made

| Question | Decision | Notes |
|----------|----------|-------|
| Multi-model support? | ✅ Yes | Haiku per task semplici, Sonnet per complessi |
| Escalation flow? | ✅ Yes | See [escalation-flow.md](docs/features/escalation-flow.md) |
| Project context? | ✅ Yes | See [project-context.md](docs/features/project-context.md) |
| Agent guardrails? | ✅ Yes | See [agent-guardrails.md](docs/features/agent-guardrails.md) |
| Notifications? | ⏳ Future | Slack/Discord - v2 |
| Scheduling? | ⏳ Future | Cron-like - v2 |
| Cloud sync? | ⏳ Future | S3/GCS - v2 |

## Roadmap

### v0.1 - MVP ✅ COMPLETATO (31 Gen 2026)
- [x] Project setup (package.json, tsconfig)
- [x] TypeScript interfaces
- [x] Feature documentation
- [x] YAML parser + validation
- [x] DAG resolver (topological sort, levels)
- [x] TaskRunner con Claude SDK + subprocess fallback
- [x] Queue manager (concurrency, events)
- [x] State persistence (JSON)
- [x] CLI (run, resume, validate, status, results, report)
- [x] Basic TUI (3 pane layout)
- [x] Basic keyboard handling (Space, Enter, Tab, Q, R, C, arrows)
- [x] Task details view (Enter to see results)
- [x] AI-generated batch report

### v0.2 - Escalation & Context ✅ COMPLETATO (31 Gen 2026)
- [x] Escalation flow implementation (runner.ts parseEscalation)
- [x] Project context collection (engine/context.ts)
- [x] Agent guardrails injection (runner.ts buildPrompt)
- [x] Escalation pane in TUI (components/EscalationPane.tsx)
- [x] Context types (types/context.ts)
- [x] Stack detection (detectStack in context.ts)
- [x] CLAUDE.md parsing (loadClaudeMd in context.ts)
- [x] Context injection in prompts (buildContextPrompt)

### v0.3 - Polish
- [ ] Multi-model support (Haiku/Sonnet)
- [ ] Log storage + viewer
- [ ] Retry failed tasks
- [ ] Better error handling

### v1.0 - Production Ready
- [ ] Full keyboard navigation
- [ ] Task detail modal
- [ ] Cost analytics
- [ ] Documentation

### v2.0 - Future
- [ ] Notifications (Slack/Discord)
- [ ] Scheduling (cron-like)
- [ ] Cloud sync (S3/GCS)
- [ ] Web dashboard?
