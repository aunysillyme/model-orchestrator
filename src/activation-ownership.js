const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Shared by upgrades and uninstall: persisted ownership is untrusted input.
export function validateActivationOwnership(key, ownership) {
  const relative = typeof key === 'string' && key.startsWith('[project] ') ? key.slice('[project] '.length) : '';
  if (!relative || /[\\:\x00-\x1f\x7f]/.test(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')
      || !object(ownership) || typeof ownership.created !== 'boolean') return `invalid activation ownership: ${key}`;
  if (ownership.kind === 'rules') {
    if (!digest(ownership.blockHash) || !['', '\n', '\n\n'].includes(ownership.addedPrefix) || !['', '\n'].includes(ownership.addedSuffix)) return `invalid rules ownership: ${key}`;
  } else if (ownership.kind === 'hooks') {
    if (!Array.isArray(ownership.hooks) || typeof ownership.hadHooks !== 'boolean' || !Array.isArray(ownership.originalEvents)
        || ownership.originalEvents.some((event) => typeof event !== 'string')
        || ownership.hooks.some((record) => !object(record) || typeof record.event !== 'string' || !object(record.group) || !object(record.hook))) return `invalid hook ownership: ${key}`;
  } else if (ownership.kind === 'mcp') {
    if (ownership.key !== 'mcpServers' || !object(ownership.servers) || typeof ownership.hadKey !== 'boolean') return `invalid MCP ownership: ${key}`;
  } else return `unknown activation ownership: ${key}`;
  return null;
}
