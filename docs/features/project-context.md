# Project Context System

> Raccolta e conservazione di informazioni sui progetti

## Overview

Prima di eseguire task, l'orchestratore raccoglie informazioni sul progetto. Dopo ogni task, salva learnings per uso futuro.

## Context Lifecycle

```
PRE-TASK                          POST-TASK
─────────                         ─────────

1. Load CLAUDE.md                 1. Estrai decisioni prese
2. Load project context JSON      2. Identifica pattern usati
3. Detect tech stack              3. Registra errori/fix
4. Inject in agent prompt         4. Salva in context JSON
```

## Storage Structure

```
context/
├── projects/
│   ├── journalowl.json
│   ├── kanv-ai.json
│   └── runekit.json
│
└── global/
    ├── learnings.json        # Pattern cross-progetto
    ├── errors-to-avoid.json  # Errori da non ripetere
    └── tech-preferences.json # Preferenze stack
```

## Project Context Schema

```typescript
interface ProjectContext {
  projectId: string;
  projectPath: string;
  lastUpdated: Date;

  // Rilevato automaticamente
  detected: {
    language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'other';
    framework?: string;           // 'next.js', 'express', 'fastapi', etc.
    packageManager?: string;      // 'npm', 'yarn', 'pnpm', 'pip', etc.
    testRunner?: string;          // 'jest', 'vitest', 'pytest', etc.
    buildTool?: string;           // 'vite', 'webpack', 'esbuild', etc.
    hasDocker: boolean;
    hasCICD: boolean;
    monorepo: boolean;
  };

  // Estratto da CLAUDE.md
  instructions: {
    raw: string;                  // Contenuto completo
    keyPoints: string[];          // Punti principali estratti
    conventions: string[];        // Convenzioni di codice
    avoidList: string[];          // Cose da evitare
  };

  // Accumulato da task precedenti
  learnings: Learning[];

  // Errori specifici del progetto da evitare
  projectAvoidList: AvoidItem[];

  // Decisioni architetturali prese
  decisions: Decision[];
}

interface Learning {
  id: string;
  date: Date;
  taskId: string;
  type: 'pattern' | 'convention' | 'gotcha' | 'optimization';
  content: string;
  relevance: 'high' | 'medium' | 'low';
}

interface AvoidItem {
  id: string;
  pattern: string;
  reason: string;
  addedFrom: string;  // taskId che ha causato
  severity: 'critical' | 'warning' | 'info';
}

interface Decision {
  id: string;
  date: Date;
  taskId: string;
  question: string;
  decision: string;
  rationale: string;
}
```

## Global Context Schema

```typescript
// global/learnings.json
interface GlobalLearnings {
  lastUpdated: Date;

  // Pattern validi per tutti i progetti
  universalPatterns: Array<{
    id: string;
    pattern: string;
    context: string;
    frequency: number;  // Quante volte usato
  }>;

  // Preferenze tecnologiche
  techPreferences: Record<string, string>;
  // es: { "auth": "JWT", "state": "zustand", "styling": "tailwind" }
}

// global/errors-to-avoid.json
interface GlobalAvoidList {
  lastUpdated: Date;

  items: Array<{
    id: string;
    pattern: string;
    reason: string;
    occurrences: number;
    projects: string[];
  }>;
}
```

## Detection Logic

```typescript
async function detectProjectStack(cwd: string): Promise<ProjectContext['detected']> {
  const files = await fs.readdir(cwd);

  // Language detection
  let language: ProjectContext['detected']['language'] = 'other';
  if (files.includes('tsconfig.json')) language = 'typescript';
  else if (files.includes('package.json')) language = 'javascript';
  else if (files.includes('pyproject.toml') || files.includes('requirements.txt')) language = 'python';
  else if (files.includes('go.mod')) language = 'go';
  else if (files.includes('Cargo.toml')) language = 'rust';

  // Framework detection (from package.json)
  let framework: string | undefined;
  if (files.includes('package.json')) {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['next']) framework = 'next.js';
    else if (deps['@remix-run/react']) framework = 'remix';
    else if (deps['express']) framework = 'express';
    else if (deps['fastify']) framework = 'fastify';
    else if (deps['react']) framework = 'react';
    else if (deps['vue']) framework = 'vue';
  }

  // ... altri detection

  return {
    language,
    framework,
    packageManager: detectPackageManager(files),
    testRunner: detectTestRunner(files),
    buildTool: detectBuildTool(files),
    hasDocker: files.includes('Dockerfile') || files.includes('docker-compose.yml'),
    hasCICD: files.includes('.github') || files.includes('.gitlab-ci.yml'),
    monorepo: files.includes('pnpm-workspace.yaml') || files.includes('lerna.json')
  };
}
```

## Context Injection in Agent Prompt

```typescript
function buildAgentPrompt(task: TaskDefinition, context: ProjectContext): string {
  return `
## Project Context

**Project:** ${context.projectId}
**Stack:** ${context.detected.language} / ${context.detected.framework || 'vanilla'}
**Test Runner:** ${context.detected.testRunner || 'none detected'}

### Project Instructions (from CLAUDE.md)
${context.instructions.keyPoints.map(p => `- ${p}`).join('\n')}

### Conventions
${context.instructions.conventions.map(c => `- ${c}`).join('\n')}

### Things to Avoid in This Project
${context.projectAvoidList.map(a => `- ❌ ${a.pattern}: ${a.reason}`).join('\n')}

### Recent Decisions
${context.decisions.slice(-5).map(d => `- ${d.question} → ${d.decision}`).join('\n')}

---

## Your Task

${task.prompt}
`;
}
```

## Learning Extraction (Post-Task)

```typescript
async function extractLearnings(
  taskId: string,
  taskResult: TaskState,
  sessionLog: string
): Promise<Learning[]> {
  // Usa Claude per estrarre learnings dal log
  const extraction = await query({
    prompt: `
Analizza questo log di esecuzione ed estrai:
1. Pattern utili riutilizzabili
2. Convenzioni seguite
3. Gotcha o problemi incontrati
4. Ottimizzazioni fatte

Log:
${sessionLog}

Rispondi in JSON:
{
  "learnings": [
    {
      "type": "pattern|convention|gotcha|optimization",
      "content": "descrizione",
      "relevance": "high|medium|low"
    }
  ]
}
`,
    options: {
      model: 'haiku',  // Usa modello economico per estrazione
      maxBudgetUsd: 0.05
    }
  });

  // Parse e ritorna
  return parseLearnings(extraction, taskId);
}
```

## Usage in YAML

```yaml
tasks:
  - id: feature-x
    project: journalowl
    cwd: ~/Desktop/Projects/journalowl

    # Abilita context loading
    loadProjectContext: true

    # Salva learnings dopo completamento
    saveLearnings: true

    # Includi anche learnings globali
    includeGlobalLearnings: true
```
