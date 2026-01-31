# Claude Orchestrator

> TUI multi-project task orchestrator powered by Claude Agent SDK

## Quick Reference

| Info | Value |
|------|-------|
| **npm** | `claude-task-orchestrator` |
| **Comandi** | `cto` (alias) / `claude-task-orchestrator` |
| **Versione** | v0.4.0 |
| **Status** | Open source, pubblicato su npm |
| **Repo** | github.com/mariomosca/claude-orchestrator |

## Cosa Fa

Orchestrator per eseguire task multipli su progetti diversi:

1. **Definisci task in YAML** - prompt, dipendenze, budget, tools
2. **DAG Resolution** - ordine automatico basato su dipendenze
3. **Plan Mode** - AI pre-analizza ogni task prima di eseguire
4. **Parallel Execution** - task indipendenti in parallelo
5. **TUI Dashboard** - monitoraggio real-time con keyboard nav
6. **Cost Tracking** - spesa per task/progetto

## Tech Stack

- TypeScript + Node.js 20+
- Ink 5 (React per TUI)
- @anthropic-ai/claude-agent-sdk
- YAML per config

## Project Structure

```
src/
├── cli.ts              # Entry point CLI
├── App.tsx             # Main TUI app
├── components/         # Ink React components
│   ├── Dashboard.tsx   # Execution view
│   ├── PlanningPane.tsx # Plan Mode
│   ├── LogViewerPane.tsx # Full log (L key)
│   ├── StatsPane.tsx   # Cost analytics (S key)
│   └── ...
├── engine/             # Core logic
│   ├── parser.ts       # YAML parsing
│   ├── dag.ts          # Dependency resolution
│   ├── queue.ts        # Execution manager
│   ├── runner.ts       # Claude SDK wrapper
│   ├── state.ts        # Persistence
│   └── analyzer.ts     # AI pre-analysis
└── types/              # TypeScript interfaces
```

## Comandi Dev

```bash
npm run dev         # Run con tsx (dev)
npm run build       # Build TypeScript
npm run typecheck   # Type check only
```

## Comandi CLI

```bash
cto run tasks.yaml --tui        # Run con TUI e Plan Mode
cto run tasks.yaml --skip-plan  # Skip Plan Mode
cto validate tasks.yaml         # Valida YAML e mostra DAG
cto resume state.json           # Riprendi batch interrotto
cto results state.json          # Mostra risultati
cto report state.json           # Genera AI summary
```

## Keyboard Shortcuts

### Plan Mode
- `Up/Down` - Naviga task
- `Enter` - Espandi dettagli
- `X/Space` - Toggle inclusione task
- `A` - Approva e inizia
- `Q` - Annulla

### Execution Mode
- `Tab` - Switch pane
- `Space` - Pause/Resume
- `Enter` - Dettagli task
- `L` - Log viewer full-screen
- `S` - Stats/costi
- `R` - Retry failed
- `Q` - Quit

## Convenzioni

- Conventional Commits
- Error categorization in DetailsPane
- State salvato in `state/`
- Logs in `logs/{batchId}/`

## Roadmap

- v0.1-v0.4: MVP, Escalation, Plan Mode, Polish - DONE
- v1.0: Tests, documentazione completa
- v2.0: Notifications, scheduling, cloud sync
