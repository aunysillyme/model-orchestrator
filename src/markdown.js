// Escape table delimiters after backslashes so existing escapes stay literal.
export function markdownCell(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
