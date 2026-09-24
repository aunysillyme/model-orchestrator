import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('#44 proxy comparison explains the request layer, installed artifacts, choices and composition', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const section = readme.match(/## Model orchestrator or a model proxy\n([\s\S]*?)(?=\n## )/)?.[1];
  assert.ok(section, 'comparison section exists');
  for (const name of ['LiteLLM', 'Portkey', 'OpenRouter', 'claude-code-router']) assert.ok(section.includes(name));
  assert.match(section, /per request underneath the agent/);
  assert.match(section, /installer that writes routing rules, subagents, hooks/);
  assert.match(section, /lane runner above the request layer/);
  assert.match(section, /Pick a proxy/);
  assert.match(section, /Pick model-orchestrator/);
  assert.match(section, /They compose/);
  const llms = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');
  assert.match(llms, /Pick a model proxy .*per-request model routing underneath an agent; pick model-orchestrator/);
});
