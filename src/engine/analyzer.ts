/**
 * AI-powered task analysis for Plan Mode
 * Uses Haiku for cost-effective pre-execution analysis
 */

import type { ParsedTask } from './parser.js';
import type { ProjectContext } from '../types/context.js';

export interface TaskAnalysis {
  taskId: string;
  summary: string;
  estimatedActions: string[];
  potentialRisks: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Analyze a single task and explain what it will do
 */
export async function analyzeTask(
  task: ParsedTask,
  projectContext?: ProjectContext
): Promise<string> {
  try {
    // Try to use Claude Agent SDK for analysis
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const contextInfo = projectContext
      ? `Stack: ${projectContext.detected.language}/${projectContext.detected.framework || 'vanilla'}`
      : 'Unknown stack';

    const prompt = `Analizza questo task e spiega in 2-3 righe cosa farà l'agent.

Task ID: ${task.id}
Progetto: ${task.project}
Directory: ${task.cwd}
${contextInfo}

Prompt del task:
${task.prompt}

Tools disponibili: ${task.tools?.join(', ') || 'default'}
Budget: $${task.budget?.toFixed(2)}

Rispondi SOLO con una breve spiegazione (max 3 righe) di cosa farà concretamente l'agent. No introduzioni, no formattazione.`;

    const result = query({
      prompt,
      options: {
        model: 'haiku',
        maxBudgetUsd: 0.02,
        allowedTools: [], // No tools needed for analysis
      }
    });

    let analysis = '';
    for await (const message of result) {
      if (message.type === 'result' && message.subtype === 'success') {
        analysis = message.result || '';
      }
    }

    return analysis.trim() || 'Analisi non disponibile';
  } catch (error) {
    // Fallback: generate basic analysis from prompt
    return generateBasicAnalysis(task);
  }
}

/**
 * Analyze multiple tasks in parallel
 */
export async function analyzeTasks(
  tasks: ParsedTask[],
  projectContexts: Map<string, ProjectContext>,
  onProgress?: (taskId: string, analysis: string) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Analyze in parallel with concurrency limit
  const concurrency = 3;
  const chunks: ParsedTask[][] = [];

  for (let i = 0; i < tasks.length; i += concurrency) {
    chunks.push(tasks.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (task) => {
      const context = projectContexts.get(task.cwd);
      const analysis = await analyzeTask(task, context);
      results.set(task.id, analysis);
      onProgress?.(task.id, analysis);
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Generate basic analysis without AI (fallback)
 */
function generateBasicAnalysis(task: ParsedTask): string {
  const prompt = task.prompt.toLowerCase();
  const actions: string[] = [];

  // Detect common patterns
  if (prompt.includes('fix') || prompt.includes('bug')) {
    actions.push('Identificherà e correggerà un bug');
  }
  if (prompt.includes('add') || prompt.includes('create') || prompt.includes('implement')) {
    actions.push('Creerà nuova funzionalità');
  }
  if (prompt.includes('refactor') || prompt.includes('clean')) {
    actions.push('Effettuerà refactoring del codice');
  }
  if (prompt.includes('test')) {
    actions.push('Lavorerà sui test');
  }
  if (prompt.includes('update') || prompt.includes('modify')) {
    actions.push('Modificherà codice esistente');
  }
  if (prompt.includes('read') || prompt.includes('analyze') || prompt.includes('check')) {
    actions.push('Analizzerà il codice');
  }

  if (actions.length === 0) {
    actions.push('Eseguirà il task come richiesto');
  }

  // Add tools info
  const toolsInfo = task.tools?.includes('Bash')
    ? ' (può eseguire comandi)'
    : '';

  return actions.join('. ') + toolsInfo + '.';
}

/**
 * Estimate total cost for analysis
 */
export function estimateAnalysisCost(taskCount: number): number {
  // Haiku costs ~$0.01 per analysis
  return taskCount * 0.01;
}
