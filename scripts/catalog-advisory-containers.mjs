import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { requestText, requestJSON, errorCode } from './catalog-advisory-http.mjs';

const exec = promisify(execFile);
export const TRIVY = { version: '0.74.0', image: 'aquasec/trivy:0.74.0' };
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ACCEPT = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].join(', ');

export function parseImageReference(reference) {
  if (typeof reference !== 'string' || !reference || /[\s?#\\]/.test(reference)) throw new Error('malformed-image-reference');
  const parts = reference.split('@');
  if (parts.length > 2 || (parts.length === 2 && !DIGEST.test(parts[1]))) throw new Error('malformed-image-reference');
  let path = parts[0];
  const tagAt = path.lastIndexOf(':');
  let tag = null;
  if (tagAt > path.lastIndexOf('/')) { tag = path.slice(tagAt + 1); path = path.slice(0, tagAt); }
  if (tag !== null && (!/^[\w][\w.-]{0,127}$/.test(tag) || tag === 'latest')) throw new Error('unpinned-image-reference');
  if (!tag && parts.length === 1) throw new Error('unpinned-image-reference');
  const segments = path.split('/');
  let registry = 'docker.io';
  if (segments[0].includes('.') || segments[0].includes(':') || segments[0] === 'localhost') registry = segments.shift();
  if (!['docker.io', 'ghcr.io'].includes(registry)) throw new Error('unsupported-image-registry');
  if (registry === 'docker.io' && segments.length === 1) segments.unshift('library');
  if (segments.length < 2 || segments.some((s) => !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(s))) throw new Error('malformed-image-reference');
  return { registry, repository: segments.join('/'), selector: parts[1] || tag,
    canonical: `${registry}/${segments.join('/')}` };
}

export async function resolveImage(reference, { platform = 'linux/amd64', fetchImpl, timeoutMs } = {}) {
  const parsed = parseImageReference(reference);
  const [os, architecture, variant] = platform.split('/');
  if (!os || !architecture || platform.split('/').length > 3 || !/^[a-z0-9/_-]+$/.test(platform)) throw new Error('unsupported-platform');
  const host = parsed.registry === 'docker.io' ? 'registry-1.docker.io' : 'ghcr.io';
  let bearer;
  async function get(kind, selector) {
    const url = `https://${host}/v2/${parsed.repository}/${kind}/${selector}`;
    const headers = { Accept: ACCEPT, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) };
    const redirect = kind === 'blobs' ? 'manual' : 'error';
    let response = await requestText(url, { headers, fetchImpl, timeoutMs, redirect });
    if (response.status === 401 && !bearer) {
      const challenge = response.headers.get('www-authenticate') || '';
      if (!/^Bearer /i.test(challenge)) throw new Error('unsupported-registry-auth');
      const values = Object.fromEntries([...challenge.matchAll(/(realm|service)="([^"]+)"/g)].map((m) => [m[1], m[2]]));
      const auth = new URL(values.realm);
      const allowed = parsed.registry === 'docker.io' ? 'https://auth.docker.io/token' : 'https://ghcr.io/token';
      if (`${auth.origin}${auth.pathname}` !== allowed || auth.username || auth.password) throw new Error('unsupported-registry-auth');
      auth.search = '';
      if (values.service) auth.searchParams.set('service', values.service);
      auth.searchParams.set('scope', `repository:${parsed.repository}:pull`);
      const token = await requestJSON(auth.href, { fetchImpl, timeoutMs });
      bearer = token.token || token.access_token;
      if (typeof bearer !== 'string' || !bearer || /[\r\n]/.test(bearer)) throw new Error('invalid-registry-token');
      response = await requestText(url, { headers: { ...headers, Authorization: `Bearer ${bearer}` }, fetchImpl, timeoutMs, redirect });
    }
    if (kind === 'blobs') {
      let location = url;
      let redirects = 0;
      while ([301, 302, 303, 307, 308].includes(response.status)) {
        if (++redirects > 3) throw new Error('registry-redirect-limit');
        const next = response.headers.get('location');
        if (!next) throw new Error('invalid-registry-redirect');
        const redirected = new URL(next, location);
        if (redirected.protocol !== 'https:' || redirected.username || redirected.password || redirected.port ||
          isIP(redirected.hostname.replace(/^\[|\]$/g, '')) || !redirected.hostname.includes('.') ||
          /(?:^|\.)(?:localhost|local|internal)$/.test(redirected.hostname)) throw new Error('invalid-registry-redirect');
        location = redirected.href;
        // Public blob redirects carry their own signed URL; registry tokens stay at the registry.
        response = await requestText(location, { fetchImpl, timeoutMs, redirect: 'manual' });
      }
    }
    if (response.status !== 200) throw new Error(`http-${response.status}`);
    const digest = `sha256:${createHash('sha256').update(response.text).digest('hex')}`;
    if (DIGEST.test(selector) && selector !== digest) throw new Error('registry-digest-mismatch');
    let data;
    try { data = JSON.parse(response.text); } catch { throw new Error('invalid-json'); }
    return { data, digest };
  }
  let manifest = await get('manifests', parsed.selector);
  if (manifest.data?.schemaVersion !== 2) throw new Error('unsupported-image-manifest');
  if (Array.isArray(manifest.data.manifests)) {
    const choices = manifest.data.manifests.filter((m) => m.platform?.os === os && m.platform?.architecture === architecture && (!variant || m.platform?.variant === variant));
    if (choices.length !== 1 || !DIGEST.test(choices[0].digest)) throw new Error('unresolved-image-platform');
    manifest = await get('manifests', choices[0].digest);
  }
  if (manifest.data?.schemaVersion !== 2 || !DIGEST.test(manifest.data.config?.digest) || !Array.isArray(manifest.data.layers)) throw new Error('invalid-image-manifest');
  const config = await get('blobs', manifest.data.config.digest);
  if (config.data?.os !== os || config.data?.architecture !== architecture || (variant && config.data?.variant !== variant)) throw new Error('image-platform-mismatch');
  return { resolvedDigest: manifest.digest, platform, reference: `${parsed.canonical}@${manifest.digest}` };
}

export function parseTrivyReport(data, target, resolved, scannerVersion) {
  if (!data || data.SchemaVersion !== 2 || data.ArtifactType !== 'container_image' || !Array.isArray(data.Results) || !data.Results.length) throw new Error('incomplete-container-report');
  const metadata = data.Metadata;
  if (!metadata || !Array.isArray(metadata.RepoDigests) || !metadata.RepoDigests.some((r) => typeof r === 'string' && r.endsWith(`@${resolved.resolvedDigest}`))) throw new Error('container-report-digest-mismatch');
  const [os, architecture] = resolved.platform.split('/');
  if (metadata.ImageConfig?.architecture !== architecture || metadata.ImageConfig?.os !== os) throw new Error('container-report-platform-mismatch');
  if (!metadata.OS?.Family || metadata.OS.EOSL === true) throw new Error('unsupported-image-os');
  const advisories = [];
  let packageCount = 0;
  let osPackages = false;
  for (const result of data.Results) {
    if (!['os-pkgs', 'lang-pkgs'].includes(result.Class) || typeof result.Type !== 'string' || !Array.isArray(result.Packages) || !result.Packages.length) throw new Error('incomplete-container-packages');
    if (result.Class === 'os-pkgs') osPackages = true;
    for (const pkg of result.Packages) if (typeof pkg.Name !== 'string' || !pkg.Name || typeof pkg.Version !== 'string' || !pkg.Version) throw new Error('incomplete-container-package');
    packageCount += result.Packages.length;
    if ('Vulnerabilities' in result && !Array.isArray(result.Vulnerabilities)) throw new Error('invalid-container-vulnerabilities');
    for (const vuln of result.Vulnerabilities || []) {
      if (typeof vuln.VulnerabilityID !== 'string' || !vuln.VulnerabilityID || typeof vuln.PkgName !== 'string' || !vuln.PkgName || typeof vuln.InstalledVersion !== 'string' || !vuln.InstalledVersion || (vuln.FixedVersion !== undefined && typeof vuln.FixedVersion !== 'string')) throw new Error('invalid-container-vulnerability');
      advisories.push({ id: vuln.VulnerabilityID, ecosystem: result.Type, package: vuln.PkgName,
        version: vuln.InstalledVersion, affectedRanges: [{ type: 'scanner-match', version: vuln.InstalledVersion }],
        fixedVersions: (vuln.FixedVersion || '').split(',').map((v) => v.trim()).filter(Boolean),
        evidenceSource: vuln.DataSource?.URL || vuln.PrimaryURL || 'Trivy vulnerability database' });
    }
  }
  if (!packageCount || !osPackages) throw new Error('incomplete-container-coverage');
  return { ...target, ...resolved, scannerVersion, packageCount, advisories,
    status: advisories.length ? 'affected' : 'clean', evidenceSource: 'Trivy vulnerability database' };
}

// Run only the scanner, with anonymous registry access and no host filesystem mounts.
export async function dockerTrivy(resolved, scanner, { timeoutMs = 720000 } = {}) {
  const dockerConfig = await mkdtemp(join(tmpdir(), 'catalog-advisory-docker-'));
  const name = `catalog-advisory-${randomUUID()}`;
  const versionName = `${name}-version`;
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'WINDIR'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  env.DOCKER_CONFIG = dockerConfig;
  const common = ['run', '--rm', '--platform', scanner.platform, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '65532:65532'];
  const options = { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env, windowsHide: true };
  try {
    const version = await exec('docker', [...common, '--name', versionName, scanner.reference, '--version'], { ...options, timeout: Math.min(timeoutMs, 60000) });
    if (!new RegExp(`^Version: ${TRIVY.version.replaceAll('.', '\\.')}\\s*$`, 'm').test(version.stdout)) throw new Error('scanner-version-mismatch');
    const run = await exec('docker', [...common, '--name', name, scanner.reference, 'image', '--quiet', '--scanners', 'vuln',
      '--list-all-pkgs', '--format', 'json', '--platform', resolved.platform, '--image-src', 'remote',
      '--timeout', '10m', '--cache-dir', '/tmp/trivy', '--skip-version-check', resolved.reference], options);
    try { return JSON.parse(run.stdout); } catch { throw new Error('invalid-json'); }
  } finally {
    // Also stop a container if its client timed out before the scanner's own deadline.
    await exec('docker', ['rm', '--force', name, versionName], { ...options, timeout: 15000 }).catch(() => {});
    await rm(dockerConfig, { recursive: true, force: true });
  }
}

export async function scanContainers(targets, { platform = 'linux/amd64', resolveImpl = resolveImage, runImpl = dockerTrivy, ...options } = {}) {
  if (!targets.length) return [];
  let scanner;
  let scannerError;
  try { scanner = await resolveImpl(TRIVY.image, { platform, ...options }); }
  catch (error) { scannerError = errorCode(error); }
  const results = [];
  for (const target of targets) {
    let resolved;
    try {
      resolved = await resolveImpl(target.package, { platform, ...options });
      if (scannerError) throw new Error(`scanner-${scannerError}`);
      const raw = await runImpl(resolved, scanner);
      results.push({ ...parseTrivyReport(raw, target, resolved, TRIVY.version), scannerVersionVerified: true, scannerDigest: scanner.resolvedDigest });
    } catch (error) {
      results.push({ ...target, ...(resolved || {}), platform, status: 'unknown', advisories: [],
        scannerVersion: TRIVY.version, scannerVersionVerified: false, scannerDigest: scanner?.resolvedDigest || null,
        evidenceSource: 'container registry and Trivy vulnerability database', reason: errorCode(error) });
    }
  }
  return results;
}
