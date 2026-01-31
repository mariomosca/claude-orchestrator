import { EventEmitter } from 'events';
import type { TaskState } from '../types/task.js';
import type { ProjectContext } from '../types/context.js';
import type { ParsedTask } from './parser.js';
import type {
  TaskStartedEvent,
  TaskProgressEvent,
  TaskToolUseEvent,
  TaskCompletedEvent,
  TaskFailedEvent
} from '../types/events.js';
import { appendToLog, saveTaskResult } from './state.js';
import { getOrCreateProjectContext, buildContextPrompt, addLearning, addDecision } from './context.js';

// NOTE: This imports the Claude Agent SDK
// If not available, we'll need to use subprocess fallback
// import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Escalation request from agent
 */
export interface EscalationRequest {
  taskId: string;
  reason: string;
  question: string;
  context?: string;
  options?: Array<{
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
}

/**
 * Escalation response from user
 */
export interface EscalationResponse {
  selectedOption?: string;
  textResponse?: string;
  action: 'continue' | 'skip' | 'agent_decide';
}

/**
 * Events emitted by TaskRunner
 */
export interface TaskRunnerEvents {
  started: (event: TaskStartedEvent) => void;
  progress: (event: TaskProgressEvent) => void;
  tool_use: (event: TaskToolUseEvent) => void;
  escalation: (request: EscalationRequest) => void;
  completed: (event: TaskCompletedEvent) => void;
  failed: (event: TaskFailedEvent) => void;
}

/**
 * TaskRunner executes a single task using Claude Agent SDK
 */
export class TaskRunner extends EventEmitter {
  private abortController: AbortController;
  private batchId: string;
  private baseDir: string;
  private escalationResolver?: (response: EscalationResponse) => void;

  constructor(batchId: string, baseDir: string = process.cwd()) {
    super();
    this.abortController = new AbortController();
    this.batchId = batchId;
    this.baseDir = baseDir;
  }

  /**
   * Run a task
   */
  async run(
    task: ParsedTask,
    existingSessionId?: string,
    globalInstructions?: string
  ): Promise<TaskState> {
    const startedAt = new Date();
    let sessionId: string | undefined = existingSessionId;
    let cost = 0;
    let result = '';

    // Load project context if enabled
    let projectContext: ProjectContext | undefined;
    if (task.loadProjectContext !== false) {
      try {
        projectContext = await getOrCreateProjectContext(task.cwd);
        await appendToLog(
          this.batchId,
          task.id,
          `Loaded context: ${projectContext.detected.language}/${projectContext.detected.framework || 'vanilla'}`,
          this.baseDir
        );
      } catch {
        // Context loading is optional
      }
    }

    // Emit started event
    this.emit('started', {
      type: 'task:started',
      taskId: task.id,
      timestamp: startedAt,
      sessionId
    } as TaskStartedEvent);

    await appendToLog(this.batchId, task.id, `Task started: ${task.prompt.slice(0, 100)}...`, this.baseDir);

    try {
      // Build full prompt with guardrails and context
      const fullPrompt = this.buildPrompt(task, globalInstructions, projectContext);

      // Execute with Claude SDK
      const queryResult = await this.executeQuery(task, fullPrompt, sessionId);

      sessionId = queryResult.sessionId;
      cost = queryResult.cost;
      result = queryResult.result;

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Emit completed event
      this.emit('completed', {
        type: 'task:completed',
        taskId: task.id,
        timestamp: completedAt,
        cost,
        duration,
        result
      } as TaskCompletedEvent);

      await appendToLog(this.batchId, task.id, `Task completed: cost=$${cost.toFixed(4)}, duration=${duration}ms`, this.baseDir);

      const taskState: TaskState = {
        status: 'completed',
        sessionId,
        startedAt,
        completedAt,
        cost,
        result
      };

      await saveTaskResult(this.batchId, task.id, taskState, this.baseDir);

      return taskState;

    } catch (error) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.abortController.signal.aborted) {
        await appendToLog(this.batchId, task.id, `Task cancelled`, this.baseDir);

        return {
          status: 'cancelled',
          sessionId,
          startedAt,
          completedAt,
          cost
        };
      }

      // Emit failed event
      this.emit('failed', {
        type: 'task:failed',
        taskId: task.id,
        timestamp: completedAt,
        cost,
        duration,
        error: errorMessage
      } as TaskFailedEvent);

      await appendToLog(this.batchId, task.id, `Task failed: ${errorMessage}`, this.baseDir);

      const taskState: TaskState = {
        status: 'failed',
        sessionId,
        startedAt,
        completedAt,
        cost,
        error: errorMessage
      };

      await saveTaskResult(this.batchId, task.id, taskState, this.baseDir);

      return taskState;
    }
  }

  /**
   * Build full prompt with guardrails, context, and instructions
   */
  private buildPrompt(
    task: ParsedTask,
    globalInstructions?: string,
    projectContext?: ProjectContext
  ): string {
    const parts: string[] = [];

    // Global guardrails
    parts.push(`## Guardrails

1. **NO REGRESSIONI**: Esegui i test prima e dopo ogni modifica. Se un test fallisce, FERMA e segnala.
2. **STUDIA PRIMA**: Leggi sempre i file prima di modificarli. Non assumere - verifica.
3. **CHIEDI SE IN DUBBIO**: Se il prompt è ambiguo o la modifica è rischiosa, escalare.
4. **SCOPE MINIMO**: Fai solo ciò che è richiesto. Non "migliorare" codice non correlato.
5. **TRASPARENZA**: Spiega sempre cosa stai per fare.

Per escalare, rispondi SOLO con questo JSON:
\`\`\`json
{
  "escalation": true,
  "reason": "tipo",
  "question": "la tua domanda",
  "options": [{"id": "opt1", "label": "Opzione 1"}]
}
\`\`\`
`);

    // Project context (if available)
    if (projectContext) {
      parts.push(buildContextPrompt(projectContext));
    }

    // Global instructions
    if (globalInstructions) {
      parts.push(`## Global Instructions\n\n${globalInstructions}`);
    }

    // Task-specific instructions
    if (task.instructions) {
      parts.push(`## Task Instructions\n\n${task.instructions}`);
    }

    // The actual task
    parts.push(`## Your Task\n\n${task.prompt}`);

    return parts.join('\n\n---\n\n');
  }

  /**
   * Execute query with Claude SDK or subprocess fallback
   */
  private async executeQuery(
    task: ParsedTask,
    prompt: string,
    existingSessionId?: string
  ): Promise<{ sessionId?: string; cost: number; result: string }> {
    // Try to use Claude Agent SDK
    try {
      return await this.executeWithSDK(task, prompt, existingSessionId);
    } catch (sdkError) {
      // Log the actual error for debugging
      const errorMsg = sdkError instanceof Error ? sdkError.message : String(sdkError);
      console.warn(`Claude SDK error: ${errorMsg}`);
      console.warn('Falling back to subprocess...');
      return await this.executeWithSubprocess(task, prompt);
    }
  }

  /**
   * Execute using Claude Agent SDK
   */
  private async executeWithSDK(
    task: ParsedTask,
    prompt: string,
    existingSessionId?: string
  ): Promise<{ sessionId?: string; cost: number; result: string }> {
    // Dynamic import to handle SDK not being installed
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    let sessionId: string | undefined = existingSessionId;
    let cost = 0;
    let result = '';

    const queryResult = query({
      prompt,
      options: {
        cwd: task.cwd,
        resume: sessionId,
        settingSources: ['project'], // Load CLAUDE.md
        allowedTools: task.tools,
        maxBudgetUsd: task.budget,
        abortController: this.abortController,
        includePartialMessages: true,
        model: task.model  // SDK accepts 'haiku', 'sonnet', 'opus' as aliases
      }
    });

    for await (const message of queryResult) {
      // Handle system init (get session ID)
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
      }

      // Handle progress/streaming
      if (message.type === 'stream_event') {
        this.emit('progress', {
          type: 'task:progress',
          taskId: task.id,
          timestamp: new Date(),
          text: message.event?.delta?.text || '',
          cost,
          elapsed: Date.now() - Date.now() // Will be calculated properly
        } as TaskProgressEvent);
      }

      // Handle tool use
      if (message.type === 'assistant') {
        for (const block of message.message?.content || []) {
          if (block.type === 'tool_use') {
            this.emit('tool_use', {
              type: 'task:tool_use',
              taskId: task.id,
              timestamp: new Date(),
              tool: block.name,
              input: block.input
            } as TaskToolUseEvent);

            await appendToLog(
              this.batchId,
              task.id,
              `Tool: ${block.name}`,
              this.baseDir
            );
          }

          // Check for escalation
          if (block.type === 'text') {
            const escalation = this.parseEscalation(block.text, task.id);
            if (escalation) {
              const response = await this.handleEscalation(escalation);
              // TODO: Inject response back into conversation
            }
          }
        }
      }

      // Handle result
      if (message.type === 'result') {
        cost = message.total_cost_usd || 0;
        if (message.subtype === 'success') {
          result = message.result || '';
        }
      }
    }

    return { sessionId, cost, result };
  }

  /**
   * Execute using subprocess (fallback)
   */
  private async executeWithSubprocess(
    task: ParsedTask,
    prompt: string
  ): Promise<{ sessionId?: string; cost: number; result: string }> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const args = [
        '-p', prompt,
        '--output-format', 'json',
        '--allowedTools', task.tools?.join(',') || 'Read,Edit',
        '--max-budget-usd', String(task.budget || 5)
      ];

      const proc = spawn('claude', args, {
        cwd: task.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            sessionId: result.session_id,
            cost: result.cost_usd || 0,
            result: result.result || stdout
          });
        } catch {
          // Non-JSON output
          resolve({
            cost: 0,
            result: stdout
          });
        }
      });

      proc.on('error', reject);

      // Handle abort
      this.abortController.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
      });
    });
  }

  /**
   * Parse escalation from agent response
   */
  private parseEscalation(text: string, taskId: string): EscalationRequest | null {
    // Look for JSON block with escalation
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?"escalation"\s*:\s*true[\s\S]*?\})\s*```/);

    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.escalation === true) {
        return {
          taskId,
          reason: parsed.reason || 'unknown',
          question: parsed.question || 'Agent needs input',
          context: parsed.context,
          options: parsed.options
        };
      }
    } catch {
      // Not valid JSON
    }

    return null;
  }

  /**
   * Handle escalation - emit event and wait for response
   */
  private async handleEscalation(request: EscalationRequest): Promise<EscalationResponse> {
    return new Promise((resolve) => {
      this.escalationResolver = resolve;
      this.emit('escalation', request);
    });
  }

  /**
   * Resolve pending escalation (called from outside)
   */
  resolveEscalation(response: EscalationResponse): void {
    if (this.escalationResolver) {
      this.escalationResolver(response);
      this.escalationResolver = undefined;
    }
  }

  /**
   * Abort the running task
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Check if aborted
   */
  isAborted(): boolean {
    return this.abortController.signal.aborted;
  }
}
