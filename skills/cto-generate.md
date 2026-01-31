# CTO Task Generator

Generate YAML task files for Claude Task Orchestrator (cto).

---

## What is CTO?

Claude Task Orchestrator runs multiple AI tasks across projects in parallel. You define tasks in YAML, it handles dependencies and execution.

**Install:** `npm install -g claude-task-orchestrator`
**Run:** `cto run tasks.yaml --tui`

---

## Your Job

When user invokes this skill:

1. **Ask what they want to accomplish** - Get the high-level goal
2. **Identify tasks** - Break down into discrete, independent or dependent tasks
3. **Gather details** - For each task: project, working directory, tools needed
4. **Generate YAML** - Create the file with proper structure

---

## YAML Schema

```yaml
name: string              # Batch name (e.g., "Morning Sprint")
maxConcurrent: number     # Max parallel tasks (default: 3)
defaultBudget: number     # Default cost limit per task in USD
defaultTools: string[]    # Default allowed tools for all tasks
globalInstructions: |     # Optional: instructions for ALL tasks
  Context that applies to every task...

tasks:
  - id: string            # Unique ID (kebab-case: fix-auth-bug)
    project: string       # Project name (for grouping in UI)
    cwd: string           # Working directory (~ is expanded)
    prompt: |             # The actual task prompt for Claude
      What to do...
    model: string         # Optional: haiku | sonnet | opus (default: sonnet)
    tools: string[]       # Optional: overrides defaultTools
    budget: number        # Optional: overrides defaultBudget
    dependsOn: string[]   # Optional: task IDs that must complete first
    instructions: |       # Optional: task-specific extra instructions
      Additional context...
```

---

## Available Tools

Common tools to allow in tasks:

| Tool | Use Case |
|------|----------|
| `Read` | Read files |
| `Edit` | Modify existing files |
| `Write` | Create new files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `Bash` | Run shell commands |
| `WebFetch` | Fetch URLs |
| `WebSearch` | Search the web |

**Conservative default:** `[Read, Edit, Glob, Grep]`
**With shell access:** `[Read, Edit, Write, Glob, Grep, Bash]`

---

## Interview Flow

### Step 1: Goal
Ask: "What do you want to accomplish in this session?"

### Step 2: Scope
Based on the answer:
- How many distinct tasks?
- Same project or multiple projects?
- Any dependencies between tasks?

### Step 3: Details per Task
For each task, determine:
- **id**: Short, descriptive, kebab-case
- **project**: Project name
- **cwd**: Full path (ask if unclear)
- **prompt**: Clear, actionable instructions
- **tools**: What access is needed?
- **budget**: How complex? ($0.50 simple, $2-3 medium, $5+ complex)
- **dependsOn**: Must wait for another task?

### Step 4: Generate
Create the YAML file in the user's preferred location (default: `tasks/` folder).

---

## Example Output

```yaml
name: "Feature Implementation Sprint"
maxConcurrent: 3
defaultBudget: 2.00
defaultTools: [Read, Edit, Glob, Grep]

tasks:
  # Backend API endpoint
  - id: add-export-api
    project: my-saas
    cwd: ~/Projects/my-saas
    prompt: |
      Add a new API endpoint POST /api/exports that:
      1. Accepts { format: 'csv' | 'json', dateRange: { from, to } }
      2. Validates input with zod
      3. Returns export job ID
      Follow existing patterns in src/api/
    tools: [Read, Edit, Write, Bash]
    budget: 3.00

  # Frontend component - depends on API
  - id: add-export-button
    project: my-saas
    cwd: ~/Projects/my-saas
    prompt: |
      Add an "Export" button to the Dashboard page that:
      1. Opens a modal with format selection (CSV/JSON)
      2. Calls the new /api/exports endpoint
      3. Shows progress toast
      Use existing Button and Modal components.
    tools: [Read, Edit]
    dependsOn: [add-export-api]
    budget: 2.00

  # Independent task - runs in parallel
  - id: update-docs
    project: my-saas
    cwd: ~/Projects/my-saas
    prompt: |
      Update README.md to document the new export feature.
      Add a section under "Features" with usage examples.
    tools: [Read, Edit]
    budget: 1.00
```

---

## Tips

1. **Be specific in prompts** - "Fix the bug" is bad, "Fix the null pointer in UserService.getById when user not found" is good
2. **Use dependencies wisely** - Only add if task B truly needs task A's output
3. **Start conservative with tools** - Add Bash only if actually needed
4. **Budget realistically** - $0.50 for trivial, $2-3 for features, $5+ for complex refactors
5. **Group by project** - Helps with cost analytics in TUI

---

## Quick Generate Mode

If user says "quick" or provides a simple list, skip the interview and generate directly:

User: "quick: fix auth bug, add logout button, update tests"
You: Generate 3 tasks with sensible defaults, ask only for cwd if unclear.
