import {createHash} from 'node:crypto';
import {Parser} from 'htmlparser2';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export async function builtDocuments(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const documents = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return builtDocuments(file);
    return entry.name.endsWith('.html') ? readFile(file, 'utf8').then(html => [html]) : [];
  }));
  return documents.flat();
}

export function inlineScriptHashes(html) {
  const hashes = [];
  let inline = false;
  let script = '';
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'script') {
        inline = !attributes.src;
        script = '';
      }
    },
    ontext(text) { if (inline) script += text; },
    onclosetag(name) {
      if (name !== 'script') return;
      if (inline) hashes.push(`'sha256-${createHash('sha256').update(script).digest('base64')}'`);
      inline = false;
    },
  });
  parser.end(html);
  return hashes;
}

export function contentSecurityPolicy(documents) {
  const hashes = [...new Set(documents.flatMap(inlineScriptHashes))].sort();
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `script-src 'self' https://www.googletagmanager.com ${hashes.join(' ')}`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https://res.cloudinary.com https://raw.githubusercontent.com https://img.shields.io https://github.com https://www.googletagmanager.com",
    "media-src 'self' https://res.cloudinary.com",
    "connect-src 'self' https://registry.npmjs.org https://www.google-analytics.com https://www.googletagmanager.com",
  ].join('; ');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--write') throw new Error('Build first, then run node website/security.mjs --write');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, '..', 'vercel.json');
  const config = JSON.parse(await readFile(file, 'utf8'));
  const headers = config.headers.find(rule => rule.source === '/(.*)').headers;
  const value = contentSecurityPolicy(await builtDocuments(path.join(here, 'dist')));
  const existing = headers.find(header => header.key.toLowerCase() === 'content-security-policy');
  if (existing) existing.value = value;
  else headers.push({key: 'Content-Security-Policy', value});
  await writeFile(file, JSON.stringify(config, null, 2) + '\n');
  console.log('Updated vercel.json CSP from built HTML. Run the website check before committing.');
}
