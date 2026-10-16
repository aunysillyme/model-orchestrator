import { byId, toolById, providerById } from '../catalog.js';

export function resolveSelection(ids) {
  const selected = [];
  const unknown = [];
  for (const id of ids) {
    if (byId[id]) selected.push(byId[id]);
    else unknown.push(id);
  }
  return { selected, unknown };
}

export function resolveApis(ids) {
  const apis = [];
  const unknown = [];
  for (const id of ids) {
    if (providerById[id]) apis.push(providerById[id]);
    else unknown.push(id);
  }
  return { apis, unknown };
}

export function resolveTools(ids) {
  const tools = [];
  const unknown = [];
  for (const id of ids) {
    if (toolById[id]) tools.push(toolById[id]);
    else unknown.push(id);
  }
  return { tools, unknown };
}
