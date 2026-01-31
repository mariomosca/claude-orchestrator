# Escalation Flow

> Agent → Orchestrator → User decision flow

## Overview

Quando un agent incontra un dubbio o una decisione importante, può "escalare" all'orchestratore che a sua volta può chiedere all'utente.

## Flow

```
Agent esegue task
     │
     ▼
┌─────────────┐     NO      ┌──────────────┐
│ Dubbio?     │────────────▶│ Continua     │
│ Decisione?  │             │ esecuzione   │
└─────────────┘             └──────────────┘
     │ YES
     ▼
Agent PAUSA + emette escalation event
     │
     ▼
Orchestrator riceve → mostra in TUI
     │
     ▼
User risponde (1-4 o testo)
     │
     ▼
Risposta → Agent → riprende esecuzione
```

## Escalation Event Schema

```typescript
interface EscalationEvent {
  type: 'escalation';
  taskId: string;
  timestamp: Date;

  reason: EscalationReason;
  question: string;
  context: string;

  options?: Array<{
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;

  // Se true, agent può decidere da solo se user non risponde
  allowAgentDecision?: boolean;

  // Timeout in secondi (default: infinito)
  timeout?: number;
}

type EscalationReason =
  | 'architecture_decision'    // Scelta tecnologica
  | 'breaking_change'          // Modifica potenzialmente distruttiva
  | 'unclear_requirement'      // Prompt ambiguo
  | 'test_failure'             // Test falliti dopo modifica
  | 'security_concern'         // Possibile problema di sicurezza
  | 'cost_warning'             // Budget quasi esaurito
  | 'file_conflict'            // Conflitto con modifiche esistenti
  | 'dependency_issue'         // Problema con dipendenze
  | 'other';                   // Altro
```

## User Response Schema

```typescript
interface EscalationResponse {
  taskId: string;
  responseType: 'option' | 'text' | 'skip' | 'agent_decide';

  // Se responseType === 'option'
  selectedOption?: string;

  // Se responseType === 'text'
  textResponse?: string;

  // Istruzioni aggiuntive
  additionalInstructions?: string;
}
```

## Escalation Rules (YAML config)

```yaml
escalationRules:
  # Regole globali
  global:
    - pattern: "breaking change"
      action: "ask_user"
    - pattern: "delete file"
      action: "ask_user"
    - pattern: "modify .env"
      action: "ask_user"
    - pattern: "npm publish"
      action: "ask_user"

  # Override per task specifici
  taskOverrides:
    deploy-production:
      alwaysAsk: true
      requireConfirmation: true
```

## TUI Escalation Pane

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  DECISION REQUIRED [journalowl-api-fix]                 │
│  ────────────────────────────────────────────────────────── │
│                                                             │
│  Reason: architecture_decision                              │
│                                                             │
│  Should I refactor the auth module to use JWT instead of    │
│  sessions? This would require changes to:                   │
│  - src/api/auth.ts                                          │
│  - src/middleware/session.ts                                │
│  - 5 test files                                             │
│                                                             │
│  Options:                                                   │
│  [1] Yes, use JWT (recommended)                             │
│  [2] No, keep sessions                                      │
│  [3] Let agent decide                                       │
│  [4] Skip this task                                         │
│  [5] Custom response...                                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Additional instructions (optional):                        │
│  > _                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Notes

### Agent Side (Prompt Instructions)

```
Quando incontri una situazione che richiede una decisione importante:

1. FERMA l'esecuzione
2. Rispondi SOLO con questo JSON:

{
  "escalation": true,
  "reason": "architecture_decision",
  "question": "La tua domanda chiara e concisa",
  "context": "Contesto rilevante",
  "options": [
    {"id": "opt1", "label": "Opzione 1", "recommended": true},
    {"id": "opt2", "label": "Opzione 2"}
  ]
}

3. ATTENDI la risposta prima di continuare
```

### Orchestrator Side

```typescript
// In runner.ts
for await (const message of queryResult) {
  if (message.type === 'assistant') {
    const content = message.message.content[0];
    if (content.type === 'text') {
      const parsed = tryParseEscalation(content.text);
      if (parsed?.escalation) {
        // Pausa task, emetti evento
        this.emit('escalation', {
          taskId: task.id,
          ...parsed
        });

        // Attendi risposta
        const response = await this.waitForEscalationResponse(task.id);

        // Continua con risposta
        // (il prossimo messaggio all'agent include la risposta)
      }
    }
  }
}
```

## Default Behaviors

| Reason | Default if no response in 5min |
|--------|--------------------------------|
| `cost_warning` | Continua (solo notifica) |
| `test_failure` | Ferma task |
| `breaking_change` | Ferma task |
| `unclear_requirement` | Ferma task |
| `architecture_decision` | Attendi indefinitamente |
