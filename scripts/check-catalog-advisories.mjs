#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogInventory } from './catalog-advisory-inventory.mjs';
import { requestJSON, errorCode } from './catalog-advisory-http.mjs';
import { scanContainers, TRIVY } from './catalog-advisory-containers.mjs';

const OSV = 'https://api.osv.dev/v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalName = (name, ecosystem) => ecosystem === 'PyPI' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;

export function parseOSVAdvisory(data, target, id) {
  if (!object(data) || data.id !== id || data.withdrawn || !Array.isArray(data.affected)) throw new Error('invalid-advisory-detail');
  const matches = data.affected.filter((a) => a.package?.ecosystem === target.ecosystem && typeof a.package?.name === 'string' &&
    canonicalName(a.package.name, target.ecosystem) === canonicalName(target.package, target.ecosystem));
  if (!matches.length) throw new Error('advisory-package-mismatch');
  const affectedRanges = [];
  const fixedVersions = [];
  for (const affected of matches) {
    if (!Array.isArray(affected.ranges) && !Array.isArray(affected.versions)) throw new Error('missing-advisory-ranges');
    if (affected.ranges !== undefined && !Array.isArray(affected.ranges)) throw new Error('invalid-advisory-ranges');
    if (affected.versions !== undefined && (!Array.isArray(affected.versions) || affected.versions.some((v) => typeof v !== 'string'))) throw new Error('invalid-advisory-versions');
    for (const range of affected.ranges || []) {
      if (!object(range) || !['SEMVER', 'ECOSYSTEM', 'GIT'].includes(range.type) || !Array.isArray(range.events) || !range.events.length) throw new Error('invalid-advisory-range');
      for (const event of range.events) {
        if (!object(event) || Object.keys(event).length !== 1 || !Object.entries(event).every(([k, v]) => ['introduced', 'fixed', 'last_affected', 'limit'].includes(k) && typeof v === 'string' && v)) throw new Error('invalid-advisory-event');
        if (event.fixed) fixedVersions.push(event.fixed);
      }
      affectedRanges.push(range);
    }
    if (affected.versions?.length) affectedRanges.push({ type: 'versions', versions: affected.versions });
  }
  if (!affectedRanges.length) throw new Error('missing-advisory-ranges');
  return { id, ecosystem: target.ecosystem, package: target.package, version: target.pinnedVersion,
    affectedRanges, fixedVersions: [...new Set(fixedVersions)], evidenceSource: `${OSV}/vulns/${encodeURIComponent(id)}` };
}

function packageProblem(target) {
  if (!['npm', 'PyPI'].includes(target.ecosystem)) return 'unsupported-ecosystem';
  const name = target.ecosystem === 'npm' ? /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/ : /^[A-Za-z0-9._-]+$/;
  if (typeof target.package !== 'string' || !name.test(target.package)) return 'invalid-package-name';
  if (typeof target.pinnedVersion !== 'string' || !/^\d[A-Za-z0-9.!+_-]*$/.test(target.pinnedVersion)) return 'missing-exact-package-version';
  return null;
}

export async function scanPackages(targets, options = {}) {
  const results = targets.map((target) => ({ ...target, scannerVersion: 'catalog-osv-adapter/1',
    evidenceSource: `${OSV}/querybatch`, status: 'unknown', advisories: [], reason: packageProblem(target) }));
  const supported = results.filter((r) => !r.reason);
  if (!supported.length) return results;
  let batch;
  try {
    batch = await requestJSON(`${OSV}/querybatch`, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: supported.map((r) => ({ package: { ecosystem: r.ecosystem, name: r.package }, version: r.pinnedVersion })) }) });
    if (!object(batch) || !Array.isArray(batch.results) || batch.results.length !== supported.length) throw new Error('incomplete-batch-response');
  } catch (error) {
    for (const result of supported) result.reason = errorCode(error);
    return results;
  }
  await Promise.all(supported.map(async (result, index) => {
    try {
      const match = batch.results[index];
      if (!object(match) || Object.keys(match).some((k) => k !== 'vulns') || ('vulns' in match && !Array.isArray(match.vulns))) throw new Error('invalid-batch-result');
      if ((match.vulns || []).some((v) => !object(v) || !ID.test(v.id || ''))) throw new Error('invalid-advisory-id');
      const ids = [...new Set((match.vulns || []).map((v) => v.id))];
      result.advisoryIds = ids;
      result.advisories = await Promise.all(ids.map(async (id) => parseOSVAdvisory(await requestJSON(`${OSV}/vulns/${encodeURIComponent(id)}`, options), result, id)));
      result.status = result.advisories.length ? 'affected' : 'clean';
      delete result.reason;
    } catch (error) { result.reason = errorCode(error); }
  }));
  return results;
}

export function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) throw new Error('invalid-exception-policy');
  for (const item of exceptions) {
    if (!object(item) || Object.keys(item).some((key) => !['ecosystem', 'package', 'version', 'advisory', 'rationale', 'expires', 'target'].includes(key)) ||
      !['ecosystem', 'package', 'version', 'advisory', 'rationale', 'expires'].every((key) => typeof item[key] === 'string' && item[key].trim()) ||
      [item.package, item.version, item.advisory, item.ecosystem].some((v) => v.includes('*')) || !ID.test(item.advisory) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.expires) || !Number.isFinite(Date.parse(item.expires)) ||
      new Date(item.expires).toISOString().slice(0, 10) !== item.expires ||
      (item.target !== undefined && (typeof item.target !== 'string' || !item.target || item.target.includes('*')))) throw new Error('invalid-exception-policy');
  }
  return exceptions;
}

export function applyExceptions(results, exceptions, now = new Date()) {
  validateExceptions(exceptions);
  return results.map((result) => {
    if (result.status !== 'affected') return result;
    const advisories = result.advisories.map((advisory) => {
      const match = exceptions.find((entry) => entry.ecosystem === advisory.ecosystem && entry.package === advisory.package &&
        entry.version === advisory.version && entry.advisory === advisory.id && Date.parse(entry.expires) > now.getTime() &&
        (result.kind === 'container' ? entry.target === result.pinnedVersion : !entry.target || entry.target === result.source));
      return { ...advisory, ...(match ? { exception: { rationale: match.rationale, expires: match.expires, target: match.target || result.source } } : {}) };
    });
    return { ...result, advisories, status: advisories.length && advisories.every((a) => a.exception) ? 'excepted' : 'affected' };
  });
}

export function reportExitCode(report) {
  if (report.policyError || !Array.isArray(report.results) || !report.results.length || report.results.some((r) => !['clean', 'affected', 'unknown', 'excepted'].includes(r.status) || r.status === 'unknown')) return 2;
  return report.results.some((r) => r.status === 'affected') ? 1 : 0;
}

const markdown = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n\x00-\x1f]/g, ' ').replaceAll('`', "'");
export function reportSummary(report) {
  const lines = ['# Catalog advisories', '', `Generated: ${markdown(report.generatedAt)}. Source: ${markdown(report.sourceCommit)}. Exit: ${reportExitCode(report)}.`, '',
    '| Source | Package/image | Version/digest | Platform | Coverage | Status |', '|---|---|---|---|---|---|'];
  for (const result of report.results) {
    lines.push(`| ${[result.source, result.package, result.resolvedDigest || result.pinnedVersion, result.platform || '', result.coverage, result.status].map(markdown).join(' | ')} |`);
  }
  for (const result of report.results) {
    if (result.reason) lines.push(`\n${markdown(result.source)}: ${markdown(result.reason)}.\n`);
    for (const advisory of result.advisories || []) lines.push(`\n- ${markdown(advisory.id)}: ${markdown(advisory.package)} ${markdown(advisory.version)}; affected ranges ${markdown(JSON.stringify(advisory.affectedRanges))}; fixed versions ${markdown(advisory.fixedVersions.join(', ') || 'none reported')}${advisory.exception ? `; exception expires ${markdown(advisory.exception.expires)} (${markdown(advisory.exception.rationale)})` : ''}.`);
  }
  if (report.policyError) lines.push('', `Exception policy: ${markdown(report.policyError)}.`);
  lines.push('', '## Explicit exclusions', '');
  for (const item of report.exclusions || []) lines.push(`- ${markdown(item.source)}: ${markdown(item.coverage)}. ${markdown(item.reason)}`);
  lines.push('', 'Clean means no advisory returned for the stated coverage at the recorded time. It does not prove safety.', '');
  return lines.join('\n');
}

export async function checkCatalog({ inventory = catalogInventory(), exceptions = [], now = new Date(), sourceCommit = null, sourceDirty = null, platform = 'linux/amd64', ...options } = {}) {
  const [packages, containers] = await Promise.all([
    scanPackages(inventory.targets.filter((t) => t.kind === 'package'), options),
    scanContainers(inventory.targets.filter((t) => t.kind === 'container'), { platform, ...options })
  ]);
  const report = { schemaVersion: 1, sourceCommit, sourceDirty, generatedAt: now.toISOString(),
    scannerVersions: { packages: 'catalog-osv-adapter/1; OSV API v1', containers: `Trivy ${TRIVY.version}` },
    results: [...packages, ...containers], exclusions: inventory.exclusions };
  try { report.results = applyExceptions(report.results, exceptions, now); }
  catch (error) { report.policyError = errorCode(error); }
  report.expiredExceptions = Array.isArray(exceptions) ? exceptions.filter((e) => object(e) && Date.parse(e.expires) <= now.getTime()) : [];
  return report;
}

export async function main(args = process.argv.slice(2)) {
  let reportDir = '.release-work/catalog-advisories';
  let exceptionFile = new URL('../docs/catalog-advisory-exceptions.json', import.meta.url);
  let platform = 'linux/amd64';
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--report-dir', '--exceptions', '--platform'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('invalid-arguments');
    const value = args[++i];
    if (flag === '--report-dir') reportDir = value;
    if (flag === '--exceptions') exceptionFile = value;
    if (flag === '--platform') platform = value;
  }
  let sourceCommit = process.env.GITHUB_SHA || null;
  if (!sourceCommit) try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  let sourceDirty = null;
  try { sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  let exceptions;
  let policyError;
  try { exceptions = JSON.parse(await readFile(exceptionFile, 'utf8')); validateExceptions(exceptions); }
  catch { exceptions = []; policyError = 'unreadable-or-invalid-exception-policy'; }
  const report = await checkCatalog({ exceptions, sourceCommit, sourceDirty, platform });
  if (policyError) report.policyError = policyError;
  await mkdir(resolve(reportDir), { recursive: true });
  await writeFile(join(resolve(reportDir), 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(resolve(reportDir), 'summary.md'), reportSummary(report));
  const counts = Object.fromEntries(['clean', 'affected', 'unknown', 'excepted'].map((status) => [status, report.results.filter((r) => r.status === status).length]));
  console.log(JSON.stringify({ reportDir, ...counts, exitCode: reportExitCode(report) }));
  return reportExitCode(report);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(errorCode(error)); process.exitCode = 2; });
}
