# templates/agents/

Loading surfaces for the primary agent. The installer writes exactly one of these, based on `--primary`:

| Primary | Written | Why |
|---|---|---|
| `claude-code` | `.claude/agents/*.md` + `CLAUDE.snippet.md` | Claude Code loads project-level subagents from that folder |
| `agy` | `.agents/agents/*.md` + `GEMINI.snippet.md` | Antigravity custom agents live there |
| `codex`, `qwen` | `AGENTS.snippet.md` / `QWEN.snippet.md` | those CLIs read a rules file but have no subagent folder |
| `grok`, `hermes` | nothing agent-specific | rules travel with the prompt or the task bundle |
| a chat app | `PASTE-INTO-YOUR-AGENT.md` | no files to load; paste into custom instructions |

`snippets/` are rendered with the chosen agent's name and rules file. Nothing here is appended to a file the user already has.
