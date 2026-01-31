# Agent Guardrails

> Istruzioni generiche di sicurezza per tutti gli agent

## Overview

Ogni agent riceve istruzioni base per evitare problemi comuni: regressioni, modifiche non richieste, assunzioni errate.

## Core Guardrails

### 1. No Regressioni

```
PRIMA di modificare codice esistente:
1. Esegui i test esistenti
2. Nota quali passano

DOPO ogni modifica:
1. Ri-esegui gli stessi test
2. Se un test che passava ora fallisce → ESCALATION
3. Non procedere finché i test non sono verdi

Se non ci sono test:
1. Segnala all'orchestratore
2. Considera di scrivere test prima della modifica
```

### 2. Studia Prima di Implementare

```
PRIMA di scrivere codice:
1. Leggi i file correlati
2. Comprendi il pattern esistente
3. Identifica le convenzioni del progetto

NON assumere:
- Come sono strutturati i file
- Quali dipendenze sono disponibili
- Come funziona il codice esistente

VERIFICA sempre:
- Leggi il file prima di modificarlo
- Cerca esempi simili nel codebase
- Controlla imports e exports
```

### 3. Chiedi in Caso di Dubbio

```
ESCALA quando:
- Il prompt è ambiguo
- La modifica potrebbe rompere altro
- Ci sono più approcci validi
- Non sei sicuro dell'impatto

COME escalare:
Rispondi con:
{
  "escalation": true,
  "reason": "unclear_requirement",
  "question": "Domanda specifica",
  "options": ["Opzione 1", "Opzione 2"]
}

NON proseguire con assunzioni.
```

### 4. Scope Minimo

```
MODIFICA solo:
- Ciò che è esplicitamente richiesto
- File strettamente necessari

NON fare:
- Refactoring "bonus"
- Miglioramenti non richiesti
- Pulizia codice non correlato
- Aggiunta feature extra

Se noti problemi non correlati:
- Segnala all'orchestratore
- Non fixarli autonomamente
```

### 5. Trasparenza

```
SEMPRE:
- Spiega cosa stai per fare prima di farlo
- Documenta le decisioni prese
- Ammetti immediatamente se qualcosa non funziona

FORMATO suggerito:
"Sto per modificare X perché Y. Questo cambierà Z."
```

## System Prompt Template

```typescript
const GUARDRAILS_PROMPT = `
## Guardrails Obbligatori

Tu sei un agent che esegue task di sviluppo. Segui SEMPRE queste regole:

### 🛡️ NO REGRESSIONI
- Esegui i test PRIMA e DOPO ogni modifica
- Se un test fallisce dopo la tua modifica, FERMA e segnala
- Non procedere mai con test rotti

### 📚 STUDIA PRIMA
- Leggi SEMPRE i file prima di modificarli
- Cerca pattern esistenti nel codebase
- Non assumere - verifica

### ❓ CHIEDI SE IN DUBBIO
- Prompt ambiguo? ESCALA
- Modifica rischiosa? ESCALA
- Più approcci validi? ESCALA

Per escalare, rispondi SOLO con:
\`\`\`json
{
  "escalation": true,
  "reason": "tipo_motivo",
  "question": "La tua domanda",
  "options": ["Opzione 1", "Opzione 2"]
}
\`\`\`

### 🎯 SCOPE MINIMO
- Fai SOLO ciò che è richiesto
- Non "migliorare" codice non correlato
- Non aggiungere feature extra

### 💬 TRASPARENZA
- Spiega sempre cosa stai per fare
- Documenta le decisioni
- Ammetti subito i problemi

---

`;
```

## Per-Task Guardrails

Oltre ai guardrails globali, ogni task può avere guardrails specifici:

```yaml
tasks:
  - id: critical-fix
    prompt: "Fix payment processing bug"

    guardrails:
      # Richiedi conferma esplicita prima di modificare
      requireConfirmation:
        - "src/payments/**"
        - "src/billing/**"

      # Non toccare mai questi file
      neverModify:
        - ".env"
        - "src/config/production.ts"

      # Esegui sempre questi comandi post-modifica
      postModifyChecks:
        - "npm test"
        - "npm run lint"

      # Massimo file modificabili
      maxFilesModified: 5

      # Escalation automatica se supera budget parziale
      escalateIfCostExceeds: 2.00
```

## Guardrails Violation Handling

```typescript
interface GuardrailViolation {
  type: 'regression' | 'scope_exceeded' | 'forbidden_file' | 'assumption';
  severity: 'warning' | 'error' | 'critical';
  description: string;
  suggestedAction: 'continue' | 'pause' | 'abort';
}

// Nel runner
async function checkGuardrails(
  action: AgentAction,
  guardrails: TaskGuardrails
): Promise<GuardrailViolation | null> {

  // Check forbidden files
  if (action.type === 'edit' && guardrails.neverModify?.includes(action.file)) {
    return {
      type: 'forbidden_file',
      severity: 'critical',
      description: `Tentativo di modificare file proibito: ${action.file}`,
      suggestedAction: 'abort'
    };
  }

  // Check file count
  if (action.type === 'edit' && modifiedFiles.size >= guardrails.maxFilesModified) {
    return {
      type: 'scope_exceeded',
      severity: 'warning',
      description: `Superato limite file modificabili (${guardrails.maxFilesModified})`,
      suggestedAction: 'pause'
    };
  }

  return null;
}
```

## Guardrails in TUI

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  GUARDRAIL WARNING [task-1]                             │
│  ────────────────────────────────────────────────────────── │
│                                                             │
│  Type: scope_exceeded                                       │
│  Agent is trying to modify 6 files (limit: 5)               │
│                                                             │
│  Files modified so far:                                     │
│  - src/api/auth.ts                                          │
│  - src/api/session.ts                                       │
│  - src/middleware/auth.ts                                   │
│  - src/types/auth.ts                                        │
│  - src/utils/token.ts                                       │
│                                                             │
│  [1] Allow this file                                        │
│  [2] Allow all remaining                                    │
│  [3] Stop task here                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Default Guardrails (applicate a tutti)

```typescript
const DEFAULT_GUARDRAILS: TaskGuardrails = {
  // Sempre eseguire test dopo modifica
  postModifyChecks: ['npm test'],

  // Mai modificare questi file senza escalation
  requireConfirmation: [
    '.env*',
    '*.config.js',
    '*.config.ts',
    'package.json',
    'package-lock.json'
  ],

  // Mai modificare
  neverModify: [
    '.git/**',
    'node_modules/**'
  ],

  // Limiti default
  maxFilesModified: 10,
  escalateIfCostExceeds: 5.00,

  // Timeout per singola operazione
  operationTimeout: 300000, // 5 minuti
};
```
