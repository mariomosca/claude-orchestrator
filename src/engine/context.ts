/**
 * Project context detection and management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  ProjectContext,
  DetectedStack,
  ProjectInstructions,
  Learning,
  Decision,
  AvoidItem,
  GlobalLearnings,
  GlobalAvoidList,
} from '../types/context.js';

// Default context storage directory
const CONTEXT_DIR = path.join(process.env.HOME || '~', '.claude-orchestrator', 'context');

/**
 * Detect project stack from file system
 */
export async function detectStack(cwd: string): Promise<DetectedStack> {
  let files: string[];
  try {
    files = await fs.readdir(cwd);
  } catch {
    return getEmptyStack();
  }

  // Language detection
  let language: DetectedStack['language'] = 'other';
  if (files.includes('tsconfig.json')) {
    language = 'typescript';
  } else if (files.includes('package.json')) {
    language = 'javascript';
  } else if (files.includes('pyproject.toml') || files.includes('requirements.txt') || files.includes('setup.py')) {
    language = 'python';
  } else if (files.includes('go.mod')) {
    language = 'go';
  } else if (files.includes('Cargo.toml')) {
    language = 'rust';
  }

  // Framework detection
  let framework: string | undefined;
  let buildTool: string | undefined;
  let testRunner: string | undefined;

  if (files.includes('package.json')) {
    try {
      const pkgPath = path.join(cwd, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Framework
      if (deps['next']) framework = 'next.js';
      else if (deps['@remix-run/react']) framework = 'remix';
      else if (deps['nuxt']) framework = 'nuxt';
      else if (deps['express']) framework = 'express';
      else if (deps['fastify']) framework = 'fastify';
      else if (deps['hono']) framework = 'hono';
      else if (deps['react']) framework = 'react';
      else if (deps['vue']) framework = 'vue';
      else if (deps['svelte']) framework = 'svelte';
      else if (deps['ink']) framework = 'ink';

      // Build tool
      if (deps['vite']) buildTool = 'vite';
      else if (deps['webpack']) buildTool = 'webpack';
      else if (deps['esbuild']) buildTool = 'esbuild';
      else if (deps['rollup']) buildTool = 'rollup';
      else if (deps['tsup']) buildTool = 'tsup';
      else if (deps['tsx']) buildTool = 'tsx';

      // Test runner
      if (deps['vitest']) testRunner = 'vitest';
      else if (deps['jest']) testRunner = 'jest';
      else if (deps['mocha']) testRunner = 'mocha';
      else if (deps['ava']) testRunner = 'ava';
    } catch {
      // Ignore parse errors
    }
  }

  // Python-specific
  if (language === 'python') {
    if (files.includes('pyproject.toml')) {
      try {
        const pyproject = await fs.readFile(path.join(cwd, 'pyproject.toml'), 'utf-8');
        if (pyproject.includes('fastapi')) framework = 'fastapi';
        else if (pyproject.includes('django')) framework = 'django';
        else if (pyproject.includes('flask')) framework = 'flask';

        if (pyproject.includes('pytest')) testRunner = 'pytest';
      } catch {
        // Ignore
      }
    }
  }

  // Package manager detection
  let packageManager: string | undefined;
  if (files.includes('pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (files.includes('yarn.lock')) packageManager = 'yarn';
  else if (files.includes('bun.lockb')) packageManager = 'bun';
  else if (files.includes('package-lock.json')) packageManager = 'npm';
  else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) packageManager = 'pip';
  else if (files.includes('Pipfile')) packageManager = 'pipenv';
  else if (files.includes('poetry.lock')) packageManager = 'poetry';

  // Docker detection
  const hasDocker = files.includes('Dockerfile') ||
    files.includes('docker-compose.yml') ||
    files.includes('docker-compose.yaml');

  // CI/CD detection
  let hasCICD = false;
  if (files.includes('.github')) {
    try {
      const githubDir = await fs.readdir(path.join(cwd, '.github'));
      hasCICD = githubDir.includes('workflows');
    } catch {
      // Ignore
    }
  }
  if (!hasCICD) {
    hasCICD = files.includes('.gitlab-ci.yml') ||
      files.includes('.circleci') ||
      files.includes('Jenkinsfile');
  }

  // Monorepo detection
  const monorepo = files.includes('pnpm-workspace.yaml') ||
    files.includes('lerna.json') ||
    files.includes('nx.json') ||
    files.includes('turbo.json');

  return {
    language,
    framework,
    packageManager,
    testRunner,
    buildTool,
    hasDocker,
    hasCICD,
    monorepo,
  };
}

/**
 * Get empty stack for fallback
 */
function getEmptyStack(): DetectedStack {
  return {
    language: 'other',
    hasDocker: false,
    hasCICD: false,
    monorepo: false,
  };
}

/**
 * Load CLAUDE.md instructions from a project
 */
export async function loadClaudeMd(cwd: string): Promise<ProjectInstructions> {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');

  try {
    const raw = await fs.readFile(claudeMdPath, 'utf-8');
    return parseClaudeMd(raw);
  } catch {
    return {
      raw: '',
      keyPoints: [],
      conventions: [],
      avoidList: [],
    };
  }
}

/**
 * Parse CLAUDE.md content to extract key points
 */
function parseClaudeMd(content: string): ProjectInstructions {
  const lines = content.split('\n');
  const keyPoints: string[] = [];
  const conventions: string[] = [];
  const avoidList: string[] = [];

  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith('#')) {
      const header = trimmed.toLowerCase();
      if (header.includes('convention') || header.includes('style')) {
        currentSection = 'conventions';
      } else if (header.includes('avoid') || header.includes('don\'t') || header.includes('never')) {
        currentSection = 'avoid';
      } else if (header.includes('important') || header.includes('key') || header.includes('rule')) {
        currentSection = 'keypoints';
      } else {
        currentSection = '';
      }
      continue;
    }

    // Extract list items
    if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (!item) continue;

      switch (currentSection) {
        case 'conventions':
          conventions.push(item);
          break;
        case 'avoid':
          avoidList.push(item);
          break;
        case 'keypoints':
          keyPoints.push(item);
          break;
        default:
          // Check for inline markers
          if (item.toLowerCase().includes('never') || item.toLowerCase().includes('don\'t')) {
            avoidList.push(item);
          } else if (item.toLowerCase().includes('always') || item.toLowerCase().includes('must')) {
            keyPoints.push(item);
          }
      }
    }
  }

  return {
    raw: content,
    keyPoints: keyPoints.slice(0, 10),
    conventions: conventions.slice(0, 10),
    avoidList: avoidList.slice(0, 10),
  };
}

/**
 * Get project ID from path
 */
export function getProjectId(projectPath: string): string {
  return path.basename(projectPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Load project context from storage
 */
export async function loadProjectContext(projectPath: string): Promise<ProjectContext | null> {
  const projectId = getProjectId(projectPath);
  const contextPath = path.join(CONTEXT_DIR, 'projects', `${projectId}.json`);

  try {
    const content = await fs.readFile(contextPath, 'utf-8');
    return JSON.parse(content) as ProjectContext;
  } catch {
    return null;
  }
}

/**
 * Save project context to storage
 */
export async function saveProjectContext(context: ProjectContext): Promise<void> {
  const contextPath = path.join(CONTEXT_DIR, 'projects', `${context.projectId}.json`);

  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(contextPath, JSON.stringify(context, null, 2));
}

/**
 * Initialize or load project context
 */
export async function getOrCreateProjectContext(projectPath: string): Promise<ProjectContext> {
  // Try to load existing
  const existing = await loadProjectContext(projectPath);

  // Detect current stack
  const detected = await detectStack(projectPath);
  const instructions = await loadClaudeMd(projectPath);

  if (existing) {
    // Update with fresh detection
    const updated: ProjectContext = {
      ...existing,
      lastUpdated: new Date().toISOString(),
      detected,
      instructions,
    };
    await saveProjectContext(updated);
    return updated;
  }

  // Create new context
  const newContext: ProjectContext = {
    projectId: getProjectId(projectPath),
    projectPath,
    lastUpdated: new Date().toISOString(),
    detected,
    instructions,
    learnings: [],
    projectAvoidList: [],
    decisions: [],
  };

  await saveProjectContext(newContext);
  return newContext;
}

/**
 * Add a learning to project context
 */
export async function addLearning(
  projectPath: string,
  taskId: string,
  type: Learning['type'],
  content: string,
  relevance: Learning['relevance'] = 'medium'
): Promise<void> {
  const context = await getOrCreateProjectContext(projectPath);

  const learning: Learning = {
    id: randomUUID(),
    date: new Date().toISOString(),
    taskId,
    type,
    content,
    relevance,
  };

  context.learnings.push(learning);
  context.lastUpdated = new Date().toISOString();

  // Keep only last 50 learnings
  if (context.learnings.length > 50) {
    context.learnings = context.learnings.slice(-50);
  }

  await saveProjectContext(context);
}

/**
 * Add a decision to project context
 */
export async function addDecision(
  projectPath: string,
  taskId: string,
  question: string,
  decision: string,
  rationale: string
): Promise<void> {
  const context = await getOrCreateProjectContext(projectPath);

  const decisionRecord: Decision = {
    id: randomUUID(),
    date: new Date().toISOString(),
    taskId,
    question,
    decision,
    rationale,
  };

  context.decisions.push(decisionRecord);
  context.lastUpdated = new Date().toISOString();

  // Keep only last 20 decisions
  if (context.decisions.length > 20) {
    context.decisions = context.decisions.slice(-20);
  }

  await saveProjectContext(context);
}

/**
 * Add an avoid item to project context
 */
export async function addAvoidItem(
  projectPath: string,
  taskId: string,
  pattern: string,
  reason: string,
  severity: AvoidItem['severity'] = 'warning'
): Promise<void> {
  const context = await getOrCreateProjectContext(projectPath);

  const avoidItem: AvoidItem = {
    id: randomUUID(),
    pattern,
    reason,
    addedFrom: taskId,
    severity,
  };

  context.projectAvoidList.push(avoidItem);
  context.lastUpdated = new Date().toISOString();

  await saveProjectContext(context);
}

/**
 * Load global learnings
 */
export async function loadGlobalLearnings(): Promise<GlobalLearnings> {
  const globalPath = path.join(CONTEXT_DIR, 'global', 'learnings.json');

  try {
    const content = await fs.readFile(globalPath, 'utf-8');
    return JSON.parse(content) as GlobalLearnings;
  } catch {
    return {
      lastUpdated: new Date().toISOString(),
      universalPatterns: [],
      techPreferences: {},
    };
  }
}

/**
 * Load global avoid list
 */
export async function loadGlobalAvoidList(): Promise<GlobalAvoidList> {
  const globalPath = path.join(CONTEXT_DIR, 'global', 'errors-to-avoid.json');

  try {
    const content = await fs.readFile(globalPath, 'utf-8');
    return JSON.parse(content) as GlobalAvoidList;
  } catch {
    return {
      lastUpdated: new Date().toISOString(),
      items: [],
    };
  }
}

/**
 * Build context prompt section for agent
 */
export function buildContextPrompt(context: ProjectContext): string {
  const sections: string[] = [];

  // Project info
  sections.push(`## Project Context\n`);
  sections.push(`**Project:** ${context.projectId}`);
  sections.push(`**Stack:** ${context.detected.language}${context.detected.framework ? ` / ${context.detected.framework}` : ''}`);

  if (context.detected.testRunner) {
    sections.push(`**Test Runner:** ${context.detected.testRunner}`);
  }
  if (context.detected.packageManager) {
    sections.push(`**Package Manager:** ${context.detected.packageManager}`);
  }

  // Instructions from CLAUDE.md
  if (context.instructions.keyPoints.length > 0) {
    sections.push(`\n### Key Project Rules`);
    context.instructions.keyPoints.forEach(p => sections.push(`- ${p}`));
  }

  if (context.instructions.conventions.length > 0) {
    sections.push(`\n### Conventions`);
    context.instructions.conventions.forEach(c => sections.push(`- ${c}`));
  }

  // Avoid list
  if (context.projectAvoidList.length > 0 || context.instructions.avoidList.length > 0) {
    sections.push(`\n### Things to Avoid`);
    context.instructions.avoidList.forEach(a => sections.push(`- ❌ ${a}`));
    context.projectAvoidList.forEach(a => sections.push(`- ❌ ${a.pattern}: ${a.reason}`));
  }

  // Recent decisions
  if (context.decisions.length > 0) {
    sections.push(`\n### Recent Decisions`);
    context.decisions.slice(-5).forEach(d => {
      sections.push(`- ${d.question} → ${d.decision}`);
    });
  }

  // High relevance learnings
  const highRelevance = context.learnings.filter(l => l.relevance === 'high').slice(-5);
  if (highRelevance.length > 0) {
    sections.push(`\n### Important Learnings`);
    highRelevance.forEach(l => sections.push(`- [${l.type}] ${l.content}`));
  }

  return sections.join('\n');
}
