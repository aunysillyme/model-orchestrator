// Keep deadlines active through body reading and reject oversized or malformed data.
export async function requestText(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBytes = 8 * 1024 * 1024, redirect = 'error', ...options } = {}) {
  if (!['error', 'manual'].includes(redirect)) throw new Error('unsupported-redirect-mode');
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, redirect, signal: controller.signal });
        const reader = response.body?.getReader();
        if (!reader) {
          if (response.status === 200) throw new Error('missing-response-body');
          return { status: response.status, headers: response.headers, text: '' };
        }
        const chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); throw new Error('response-too-large'); }
          chunks.push(Buffer.from(value));
        }
        return { status: response.status, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('request-timeout')); }, timeoutMs);
      })
    ]);
  } finally { clearTimeout(timer); }
}

export async function requestJSON(url, options) {
  const response = await requestText(url, options);
  if (response.status !== 200) throw new Error(`http-${response.status}`);
  try { return JSON.parse(response.text); } catch { throw new Error('invalid-json'); }
}

export function errorCode(error) {
  const code = error?.cause?.code || error?.code;
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'].includes(code)) return `network-${code.toLowerCase()}`;
  if (code === 'ENOENT') return 'executable-unavailable';
  const message = error?.message;
  return typeof message === 'string' && /^(?:http-\d{3}|[a-z][a-z0-9-]{0,80})$/.test(message)
    ? message : 'request-or-scanner-failed';
}
