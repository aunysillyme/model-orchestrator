// Minimal {{key}} renderer. No logic in templates on purpose: anything that
// needs a decision is computed in install.js and handed in as a string.
export function render(text, vars) {
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`template placeholder without a value: ${key}`);
    return String(vars[key]);
  });
}
