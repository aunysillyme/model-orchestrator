import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AIS, TOOLS, IMAGES, PROVIDERS } from '../src/catalog.js';
import { catalogInventory } from '../scripts/catalog-advisory-inventory.mjs';
import { scanPackages, applyExceptions, validateExceptions, reportExitCode, reportSummary, checkCatalog } from '../scripts/check-catalog-advisories.mjs';
import { parseImageReference, resolveImage, parseTrivyReport, scanContainers, TRIVY } from '../scripts/catalog-advisory-containers.mjs';
import { requestJSON, requestText, errorCode } from '../scripts/catalog-advisory-http.mjs';

const target = { kind: 'package', source: 'TOOLS:fixture', ecosystem: 'npm', package: 'fixture-package', pinnedVersion: '1.0.0', coverage: 'direct-package' };
const advisory = { id: 'TEST-2026-0001', affected: [{ package: { ecosystem: 'npm', name: 'fixture-package' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] };
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const clone = (value) => JSON.parse(JSON.stringify(value));
const digest = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const image = { kind: 'container', source: 'IMAGES:fixture', ecosystem: 'container', package: 'fixture/image:1.0.0', pinnedVersion: 'fixture/image:1.0.0', coverage: 'image-os-and-language-packages' };
const resolved = { resolvedDigest: `sha256:${'a'.repeat(64)}`, platform: 'linux/amd64', reference: `docker.io/fixture/image@sha256:${'a'.repeat(64)}` };
const now = new Date('2026-09-28T12:00:00.000Z');
const exception = { ecosystem: 'npm', package: target.package, version: target.pinnedVersion, advisory: advisory.id, rationale: 'Fixture review with a dated follow-up.', expires: '2026-10-01' };

function fixtureFetch(vulnerable = true) {
  return async (url) => {
    assert.ok(url.startsWith('https://api.osv.dev/v1/'));
    return response(url.endsWith('querybatch') ? { results: [vulnerable ? { vulns: [{ id: advisory.id }] } : {}] } : advisory);
  };
}

function trivyFixture(vulnerable = false) {
  return { SchemaVersion: 2, ArtifactType: 'container_image',
    Metadata: { RepoDigests: [resolved.reference], OS: { Family: 'debian', Name: '12' }, ImageConfig: { os: 'linux', architecture: 'amd64' } },
    Results: [{ Class: 'os-pkgs', Type: 'debian', Packages: [{ Name: 'fixture-os-package', Version: '1.0.0' }],
      Vulnerabilities: vulnerable ? [{ VulnerabilityID: 'CVE-2026-0001', PkgName: 'fixture-os-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1, 1.1.0', DataSource: { URL: 'https://example.test/advisory' } }] : [] },
    { Class: 'lang-pkgs', Type: 'npm', Packages: [{ Name: target.package, Version: target.pinnedVersion }] }] };
}

function registryFixture({ os = 'linux', architecture = 'amd64', indexed = true, available = true } = {}) {
  const config = JSON.stringify({ os, architecture });
  const configDigest = digest(config);
  const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: configDigest }, layers: [] });
  const manifestDigest = digest(manifest);
  const index = JSON.stringify({ schemaVersion: 2, manifests: available ? [{ digest: manifestDigest, platform: { os, architecture } }] : [] });
  const paths = new Map([['/v2/fixture/image/manifests/1.0.0', indexed ? index : manifest], [`/v2/fixture/image/manifests/${manifestDigest}`, manifest], [`/v2/fixture/image/blobs/${configDigest}`, config]]);
  return { manifestDigest, configDigest, paths, config, fetchImpl: async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://registry-1.docker.io');
    assert.ok(paths.has(parsed.pathname), `unexpected fixture request: ${parsed.pathname}`);
    return new Response(paths.get(parsed.pathname), { status: 200 });
  } };
}

function assertUnknown(results) {
  assert.ok(results.every((entry) => entry.status === 'unknown'));
  assert.equal(reportExitCode({ results }), 2);
}

test('known-affected metadata fails with advisory ID and fixed version; clean control passes', async () => {
  const affected = await scanPackages([target], { fetchImpl: fixtureFetch() });
  assert.equal(affected[0].status, 'affected');
  assert.equal(affected[0].advisories[0].id, advisory.id);
  assert.deepEqual(affected[0].advisories[0].fixedVersions, ['1.0.1']);
  assert.deepEqual(affected[0].advisories[0].affectedRanges, advisory.affected[0].ranges);
  assert.equal(reportExitCode({ results: affected }), 1);
  assert.throws(() => assert.equal(affected[0].status, 'clean'), assert.AssertionError);
  const clean = await scanPackages([{ ...target, pinnedVersion: '1.0.1' }], { fetchImpl: fixtureFetch(false) });
  assert.equal(clean[0].status, 'clean');
  assert.equal(reportExitCode({ results: clean }), 0);
});

test('package query sends exact metadata and accepts the OSV empty-object clean response', async () => {
  const results = await scanPackages([target], { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.osv.dev/v1/querybatch');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), { queries: [{ package: { ecosystem: 'npm', name: target.package }, version: target.pinnedVersion }] });
    return response({ results: [{}] });
  } });
  assert.equal(results[0].status, 'clean');
});

test('unavailable package data remains unknown and cannot pass', async (t) => {
  for (const [name, fetchImpl, reason] of [
    ['timeout', async () => new Promise(() => {}), 'request-timeout'],
    ['HTTP error', async () => response({}, 503), 'http-503'],
    ['invalid JSON', async () => new Response('{'), 'invalid-json'],
    ['partial batch', async () => response({ results: [] }), 'incomplete-batch-response'],
    ['missing batch', async () => response({}), 'incomplete-batch-response'],
    ['null batch item', async () => response({ results: [null] }), 'invalid-batch-result'],
    ['unexpected item fields', async () => response({ results: [{ error: 'unavailable' }] }), 'invalid-batch-result'],
    ['invalid vulnerabilities', async () => response({ results: [{ vulns: {} }] }), 'invalid-batch-result'],
    ['invalid advisory ID', async () => response({ results: [{ vulns: [{ id: '../secret' }] }] }), 'invalid-advisory-id']
  ]) await t.test(name, async () => {
    const results = await scanPackages([target], { fetchImpl, timeoutMs: 10 });
    assertUnknown(results);
    assert.equal(results[0].reason, reason);
  });
});

test('missing or unsupported package metadata is unknown without requesting a database', async () => {
  for (const [change, reason] of [[{ ecosystem: 'unknown' }, 'unsupported-ecosystem'], [{ package: null }, 'invalid-package-name'], [{ pinnedVersion: null }, 'missing-exact-package-version'], [{ pinnedVersion: '^1.0.0' }, 'missing-exact-package-version']]) {
    const results = await scanPackages([{ ...target, ...change }], { fetchImpl: () => assert.fail('unsupported metadata must not be queried') });
    assertUnknown(results);
    assert.equal(results[0].reason, reason);
  }
});

test('partial, mismatched or unavailable advisory details remain unknown', async (t) => {
  for (const [name, detail] of [
    ['missing ranges', { id: advisory.id, affected: [{ package: advisory.affected[0].package }] }],
    ['mismatched ID', { ...advisory, id: 'TEST-OTHER' }],
    ['mismatched package', { ...advisory, affected: [{ ...advisory.affected[0], package: { ecosystem: 'npm', name: 'other-package' } }] }],
    ['empty ranges', { ...advisory, affected: [{ ...advisory.affected[0], ranges: [] }] }],
    ['withdrawn record', { ...advisory, withdrawn: '2026-09-01T00:00:00Z' }],
    ['invalid event', { ...advisory, affected: [{ ...advisory.affected[0], ranges: [{ type: 'SEMVER', events: [{ fixed: 1 }] }] }] }]
  ]) await t.test(name, async () => assertUnknown(await scanPackages([target], { fetchImpl: async (url) => response(url.endsWith('querybatch') ? { results: [{ vulns: [{ id: advisory.id }] }] } : detail) })));
  const results = await scanPackages([target], { fetchImpl: async (url) => url.endsWith('querybatch') ? response({ results: [{ vulns: [{ id: advisory.id }] }] }) : response({}, 404) });
  assertUnknown(results);
  assert.equal(results[0].reason, 'http-404');
});

test('PyPI advisory matching uses normalized package names', async () => {
  const detail = { ...advisory, affected: [{ ...advisory.affected[0], package: { ecosystem: 'PyPI', name: 'fixture-package' } }] };
  const results = await scanPackages([{ ...target, ecosystem: 'PyPI', package: 'Fixture_Package' }], { fetchImpl: async (url) => response(url.endsWith('querybatch') ? { results: [{ vulns: [{ id: advisory.id }] }] } : detail) });
  assert.equal(results[0].status, 'affected');
});

test('HTTP reader deadlines cover stalled response bodies and bound the data size', async () => {
  await assert.rejects(requestText('https://example.test', { timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) }), /request-timeout/);
  await assert.rejects(requestText('https://example.test', { maxBytes: 2, fetchImpl: async () => new Response('too large') }), /response-too-large/);
  await assert.rejects(requestJSON('https://example.test', { fetchImpl: async () => new Response('{}', { status: 429 }) }), /http-429/);
  await assert.rejects(requestJSON('https://example.test', { fetchImpl: async () => new Response('not JSON') }), /invalid-json/);
  await assert.rejects(requestJSON('https://example.test', { fetchImpl: async () => new Response(null, { status: 200 }) }), /missing-response-body/);
  await assert.rejects(requestJSON('https://example.test', { fetchImpl: async () => new Response(null, { status: 503 }) }), /http-503/);
  await assert.rejects(requestText('https://example.test', { redirect: 'follow', fetchImpl: () => assert.fail('automatic redirects must not run') }), /unsupported-redirect-mode/);
  assert.equal(errorCode(new Error('sensitive diagnostic', { cause: { code: 'ENOTFOUND' } })), 'network-enotfound');
  assert.equal(errorCode(new Error('sensitive diagnostic')), 'request-or-scanner-failed');
});

test('catalog inventory covers every package/image pin and identifies exclusions', () => {
  const inventory = catalogInventory();
  for (const ai of AIS) {
    const source = `AIS:${ai.id}`;
    if (ai.install?.pin || ai.install?.npm) {
      const entry = inventory.targets.find((item) => item.source === source);
      assert.ok(entry, source);
      assert.equal(entry.pinnedVersion, ai.install.pin);
      assert.equal(entry.package, ai.install.npm || ai.install.advisory?.package);
    } else assert.ok(inventory.exclusions.some((entry) => entry.source === source && entry.reason), source);
  }
  for (const tool of TOOLS) {
    const entry = inventory.targets.find((item) => item.source === `TOOLS:${tool.id}`);
    assert.ok(entry, tool.id);
    assert.equal(entry.pinnedVersion, tool.pin);
    assert.equal(entry.package, tool.advisory.package);
    assert.equal(entry.ecosystem, tool.advisory.ecosystem);
  }
  for (const [id, reference] of Object.entries(IMAGES)) {
    const entry = inventory.targets.find((item) => item.source === `IMAGES:${id}`);
    assert.equal(entry.package, reference);
    assert.equal(entry.pinnedVersion, reference);
  }
  for (const provider of PROVIDERS) assert.ok(inventory.exclusions.some((item) => item.source === `PROVIDERS:${provider.id}` && item.coverage === 'remote-service'));
  assert.ok(inventory.exclusions.some((item) => item.coverage === 'optional-extras' && item.extras.includes('full')));
  assert.ok(inventory.exclusions.some((item) => item.coverage === 'transitive-dependencies'));
});

test('changing or adding catalog pins changes inventory without a second version list', () => {
  const inputs = { ais: [{ id: 'fixture-ai', install: { npm: 'fixture-ai', pin: '1.0.0' } }], tools: [], images: {}, providers: [] };
  assert.equal(catalogInventory(inputs).targets[0].pinnedVersion, '1.0.0');
  inputs.ais[0].install.pin = '1.0.1';
  inputs.ais.push({ id: 'extra-ai', install: { pin: '2.0.0', advisory: { ecosystem: 'PyPI', package: 'extra-ai' } } });
  inputs.tools.push({ id: 'extra-tool', pin: '3.0.0', advisory: { ecosystem: 'npm', package: '@fixture/tool', extras: ['full'] } });
  inputs.images.extra = 'fixture/image:4.0.0';
  const inventory = catalogInventory(inputs);
  assert.deepEqual(inventory.targets.map((entry) => entry.pinnedVersion), ['1.0.1', '2.0.0', '3.0.0', 'fixture/image:4.0.0']);
  assert.deepEqual(inventory.targets.map((entry) => entry.package), ['fixture-ai', 'extra-ai', '@fixture/tool', 'fixture/image:4.0.0']);
});

test('a declared pin with missing metadata remains in inventory as unknown', async () => {
  const inventory = catalogInventory({ ais: [{ id: 'incomplete-ai', install: { pin: '1.0.0' } }], tools: [{ id: 'incomplete-tool', pin: '2.0.0' }], images: {}, providers: [] });
  assert.equal(inventory.targets.length, 2);
  assert.deepEqual(inventory.targets.map((entry) => entry.pinnedVersion), ['1.0.0', '2.0.0']);
  assertUnknown(await scanPackages(inventory.targets, { fetchImpl: () => assert.fail('missing metadata must not query') }));
});

test('image parser accepts exact tags and digests and rejects malformed or floating references', () => {
  assert.deepEqual(parseImageReference('fixture/image:1.0.0'), { registry: 'docker.io', repository: 'fixture/image', selector: '1.0.0', canonical: 'docker.io/fixture/image' });
  assert.equal(parseImageReference('debian:12').repository, 'library/debian');
  assert.equal(parseImageReference(`ghcr.io/fixture/image@${resolved.resolvedDigest}`).selector, resolved.resolvedDigest);
  for (const reference of [null, '', 'fixture/image', 'fixture/image:latest', 'fixture/image:', 'fixture//image:1', 'Fixture/image:1', 'fixture/image:1?x', 'fixture/image:1#x', 'fixture/image:1 bad', 'fixture/image@sha256:abcd', 'fixture/image@bad@bad', 'https://example.test/image:1']) assert.throws(() => parseImageReference(reference), /(?:malformed|unpinned|unsupported)-image/);
  assert.throws(() => parseImageReference('unsupported.test/fixture/image:1'), /unsupported-image-registry/);
  for (const registry of ['docker.io.evil.test', 'evildocker.io', 'docker.io:443', 'ghcr.io.evil.test']) {
    assert.throws(() => parseImageReference(`${registry}/fixture/image:1`), /unsupported-image-registry/);
  }
  assert.throws(() => parseImageReference('docker.io@evil.test/fixture/image:1'), /malformed-image-reference/);
});

test('registry fixtures resolve a tag to a verified digest and record platform', async () => {
  const fixture = registryFixture();
  assert.deepEqual(await resolveImage(image.package, { fetchImpl: fixture.fetchImpl, platform: 'linux/amd64' }), { resolvedDigest: fixture.manifestDigest, platform: 'linux/amd64', reference: `docker.io/fixture/image@${fixture.manifestDigest}` });
  const direct = registryFixture({ indexed: false });
  assert.equal((await resolveImage(image.package, { fetchImpl: direct.fetchImpl })).resolvedDigest, direct.manifestDigest);
});

test('registry rejects unresolved platform, digest mismatch, malformed JSON and unavailable data', async () => {
  await assert.rejects(resolveImage(image.package, { fetchImpl: registryFixture({ available: false }).fetchImpl }), /unresolved-image-platform/);
  await assert.rejects(resolveImage(image.package, { fetchImpl: registryFixture({ architecture: 'arm64', indexed: false }).fetchImpl }), /image-platform-mismatch/);
  const mismatch = registryFixture();
  mismatch.paths.set(`/v2/fixture/image/manifests/${mismatch.manifestDigest}`, '{}');
  await assert.rejects(resolveImage(image.package, { fetchImpl: mismatch.fetchImpl }), /registry-digest-mismatch/);
  await assert.rejects(resolveImage(image.package, { fetchImpl: async () => new Response('{') }), /invalid-json/);
  await assert.rejects(resolveImage(image.package, { fetchImpl: async () => response({}, 503) }), /http-503/);
  await assert.rejects(resolveImage(image.package, { platform: 'invalid', fetchImpl: () => assert.fail('invalid platform must not request') }), /unsupported-platform/);
});

test('registry fixtures allow known anonymous auth and strip it on bounded HTTPS blob redirects', async () => {
  const fixture = registryFixture();
  let redirected = false;
  const result = await resolveImage(image.package, { fetchImpl: async (url, options) => {
    if (url.startsWith('https://auth.docker.io/token')) {
      assert.equal(new URL(url).searchParams.get('scope'), 'repository:fixture/image:pull');
      return response({ token: 'public-fixture-token' });
    }
    if (url === 'https://cdn.example.test/blob') {
      redirected = true;
      assert.equal(options.headers?.Authorization, undefined);
      assert.equal(options.redirect, 'manual');
      return new Response(fixture.config);
    }
    if (!options.headers?.Authorization) return response({}, 401, { 'www-authenticate': 'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"' });
    assert.equal(options.headers.Authorization, 'Bearer public-fixture-token');
    if (url.includes('/blobs/')) {
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 307, headers: { location: 'https://cdn.example.test/blob' } });
    }
    assert.equal(options.redirect, 'error');
    return fixture.fetchImpl(url);
  } });
  assert.ok(redirected);
  assert.equal(result.resolvedDigest, fixture.manifestDigest);
  await assert.rejects(resolveImage(image.package, { fetchImpl: async () => response({}, 401, { 'www-authenticate': 'Bearer realm="https://example.test/token"' }) }), /unsupported-registry-auth/);
});

test('registry rejects HTTP and local blob redirects and stops redirect loops', async () => {
  for (const location of ['http://cdn.example.test/blob', 'https://127.0.0.1/blob', 'https://localhost/blob', 'https://a:b@cdn.example.test/blob']) {
    const fixture = registryFixture();
    await assert.rejects(resolveImage(image.package, { fetchImpl: async (url) => url.includes('/blobs/') ? new Response('', { status: 307, headers: { location } }) : fixture.fetchImpl(url) }), /invalid-registry-redirect/);
  }
  const fixture = registryFixture();
  let count = 0;
  await assert.rejects(resolveImage(image.package, { fetchImpl: async (url) => {
    if (url.includes('/blobs/') || url.startsWith('https://cdn.example.test/')) {
      count++;
      return new Response('', { status: 307, headers: { location: 'https://cdn.example.test/loop' } });
    }
    return fixture.fetchImpl(url);
  } }), /registry-redirect-limit/);
  assert.equal(count, 4);
});

test('Trivy metadata records OS and language coverage with affected and clean results', () => {
  const clean = parseTrivyReport(trivyFixture(), image, resolved, TRIVY.version);
  assert.equal(clean.status, 'clean');
  assert.equal(clean.packageCount, 2);
  assert.equal(clean.resolvedDigest, resolved.resolvedDigest);
  assert.equal(clean.platform, 'linux/amd64');
  const affected = parseTrivyReport(trivyFixture(true), image, resolved, TRIVY.version);
  assert.equal(affected.status, 'affected');
  assert.deepEqual(affected.advisories[0].fixedVersions, ['1.0.1', '1.1.0']);
  assert.equal(affected.advisories[0].id, 'CVE-2026-0001');
  assert.equal(reportExitCode({ results: [affected] }), 1);
});

test('partial or mismatched Trivy reports remain unknown through the container adapter', async (t) => {
  for (const [name, mutate] of [
    ['empty report', (data) => { data.Results = []; }],
    ['missing packages', (data) => { delete data.Results[0].Packages; }],
    ['empty packages', (data) => { data.Results[0].Packages = []; }],
    ['missing package version', (data) => { delete data.Results[0].Packages[0].Version; }],
    ['missing OS coverage', (data) => { data.Results.shift(); }],
    ['mismatched digest', (data) => { data.Metadata.RepoDigests = ['fixture/image@sha256:bad']; }],
    ['mismatched platform', (data) => { data.Metadata.ImageConfig.architecture = 'arm64'; }],
    ['unsupported OS', (data) => { data.Metadata.OS.EOSL = true; }],
    ['invalid vulnerabilities', (data) => { data.Results[0].Vulnerabilities = {}; }],
    ['partial vulnerability', (data) => { data.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-2026-0001' }]; }]
  ]) await t.test(name, async () => {
    const raw = trivyFixture();
    mutate(raw);
    assertUnknown(await scanContainers([image], { resolveImpl: async () => resolved, runImpl: async () => raw }));
  });
});

test('unresolved images and scanner failures cannot produce clean container results', async () => {
  for (const message of ['http-503', 'request-timeout', 'invalid-json', 'malformed-image-reference']) assertUnknown(await scanContainers([image], { resolveImpl: async () => { throw new Error(message); }, runImpl: () => assert.fail('unresolved image must not scan') }));
  const results = await scanContainers([image], { resolveImpl: async (reference) => {
    if (reference === TRIVY.image) throw new Error('http-503');
    return resolved;
  }, runImpl: () => assert.fail('unresolved scanner must not run') });
  assertUnknown(results);
  assert.equal(results[0].resolvedDigest, resolved.resolvedDigest);
  assert.equal(results[0].reason, 'scanner-http-503');
  assert.equal(results[0].scannerVersionVerified, false);
});

test('container adapter records scanner digest and version using injected metadata only', async () => {
  const scannerDigest = `sha256:${'b'.repeat(64)}`;
  const results = await scanContainers([image], { resolveImpl: async (reference) => reference === TRIVY.image ? { ...resolved, resolvedDigest: scannerDigest } : resolved,
    runImpl: async (selected, scanner) => {
      assert.equal(selected.resolvedDigest, resolved.resolvedDigest);
      assert.equal(scanner.resolvedDigest, scannerDigest);
      return trivyFixture();
    } });
  assert.equal(results[0].status, 'clean');
  assert.equal(results[0].scannerDigest, scannerDigest);
  assert.equal(results[0].scannerVersion, TRIVY.version);
  assert.equal(results[0].scannerVersionVerified, true);
});

test('exceptions require an exact package, version, ecosystem and advisory match', async () => {
  const affected = await scanPackages([target], { fetchImpl: fixtureFetch() });
  const accepted = applyExceptions(affected, [exception], now);
  assert.equal(accepted[0].status, 'excepted');
  assert.equal(accepted[0].advisories[0].exception.expires, exception.expires);
  assert.equal(reportExitCode({ results: accepted }), 0);
  for (const field of ['package', 'version', 'ecosystem', 'advisory']) assert.equal(applyExceptions(affected, [{ ...exception, [field]: `${exception[field]}-other` }], now)[0].status, 'affected', field);
  assert.equal(applyExceptions(affected, [{ ...exception, target: 'TOOLS:other' }], now)[0].status, 'affected');
  assert.equal(affected[0].status, 'affected');
  assert.equal(affected[0].advisories[0].exception, undefined);
});

test('expired exceptions stop matching at UTC midnight and partial exceptions leave affected status', async () => {
  const affected = await scanPackages([target], { fetchImpl: fixtureFetch() });
  for (const instant of ['2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z']) assert.equal(applyExceptions(affected, [exception], new Date(instant))[0].status, 'affected');
  const multiple = clone(affected);
  multiple[0].advisories.push({ ...multiple[0].advisories[0], id: 'TEST-2026-0002' });
  assert.equal(applyExceptions(multiple, [exception], now)[0].status, 'affected');
  assert.equal(applyExceptions([{ ...target, status: 'unknown', advisories: [] }], [exception], now)[0].status, 'unknown');
});

test('container exceptions require the exact image target as well as package metadata', () => {
  const affected = parseTrivyReport(trivyFixture(true), image, resolved, TRIVY.version);
  const policy = { ...exception, ecosystem: 'debian', package: 'fixture-os-package', advisory: 'CVE-2026-0001' };
  assert.equal(applyExceptions([affected], [policy], now)[0].status, 'affected');
  assert.equal(applyExceptions([affected], [{ ...policy, target: 'fixture/other:1.0.0' }], now)[0].status, 'affected');
  assert.equal(applyExceptions([affected], [{ ...policy, target: image.pinnedVersion }], now)[0].status, 'excepted');
});

test('exception policies reject malformed entries, impossible dates and broad ignores', () => {
  for (const policy of [null, {}, [null], [{}], [{ ...exception, rationale: '' }], [{ ...exception, expires: '2026-02-30' }], [{ ...exception, expires: 'tomorrow' }], [{ ...exception, ignoreAll: true }], [{ ...exception, target: '*' }]]) assert.throws(() => validateExceptions(policy), /invalid-exception-policy/);
  for (const field of ['package', 'version', 'ecosystem', 'advisory']) assert.throws(() => validateExceptions([{ ...exception, [field]: '*' }]), /invalid-exception-policy/);
  assert.deepEqual(validateExceptions([exception]), [exception]);
});

test('empty, unknown, invalid or failed reports never pass', () => {
  for (const report of [{}, { results: [] }, { results: null }, { results: [{ status: 'unknown' }] }, { results: [{ status: 'unexpected' }] }, { results: [{ status: 'clean' }], policyError: 'invalid-exception-policy' }]) assert.equal(reportExitCode(report), 2);
  assert.equal(reportExitCode({ results: [{ status: 'clean' }, { status: 'affected' }] }), 1);
  assert.equal(reportExitCode({ results: [{ status: 'affected' }, { status: 'unknown' }] }), 2);
  assert.equal(reportExitCode({ results: [{ status: 'clean' }, { status: 'excepted' }] }), 0);
});

test('dated report includes versions, source, scanner and coverage evidence with expired exceptions', async () => {
  const report = await checkCatalog({ inventory: { targets: [target, image], exclusions: [{ source: 'TOOLS:fixture', coverage: 'transitive-dependencies', reason: 'Fixture has no lockfile.' }] }, exceptions: [{ ...exception, expires: '2026-09-01' }], now, sourceCommit: 'fixture-commit', fetchImpl: fixtureFetch(), resolveImpl: async () => resolved, runImpl: async () => trivyFixture() });
  assert.equal(report.generatedAt, now.toISOString());
  assert.equal(report.sourceCommit, 'fixture-commit');
  assert.ok(report.scannerVersions.packages.includes('OSV'));
  assert.ok(report.scannerVersions.containers.includes(TRIVY.version));
  assert.equal(report.results.length, 2);
  assert.equal(report.expiredExceptions.length, 1);
  assert.equal(reportExitCode(report), 1);
  for (const result of report.results) for (const field of ['ecosystem', 'package', 'pinnedVersion', 'coverage', 'status', 'evidenceSource', 'scannerVersion']) assert.ok(result[field], field);
  const summary = reportSummary(report);
  for (const text of ['TEST-2026-0001', '1.0.1', now.toISOString(), 'transitive-dependencies', 'does not prove safety']) assert.ok(summary.includes(text), text);
  const rows = summary.split('\n');
  const header = rows.findIndex((line) => line.startsWith('| Source |'));
  assert.equal(rows[header + 2].startsWith('| TOOLS:fixture |'), true);
  assert.equal(rows[header + 3].startsWith('| IMAGES:fixture |'), true);
});

test('invalid exception policy fails even when scan results are clean', async () => {
  const report = await checkCatalog({ inventory: { targets: [target], exclusions: [] }, exceptions: [{ ...exception, package: '*' }], fetchImpl: fixtureFetch(false), now });
  assert.equal(report.results[0].status, 'clean');
  assert.equal(report.policyError, 'invalid-exception-policy');
  assert.equal(reportExitCode(report), 2);
  const nullEntry = await checkCatalog({ inventory: { targets: [target], exclusions: [] }, exceptions: [null], fetchImpl: fixtureFetch(false), now });
  assert.equal(nullEntry.policyError, 'invalid-exception-policy');
  assert.deepEqual(nullEntry.expiredExceptions, []);
  assert.equal(reportExitCode(nullEntry), 2);
});

test('advisory workflow keeps read-only permissions, immutable action pins and failure artifacts', () => {
  const workflow = readFileSync(new URL('../.github/workflows/catalog-advisories.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow, /(?:contents|id-token|packages|actions): write/);
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => /^actions\/[a-z-]+@[a-f0-9]{40}$/.test(action)));
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /pull_request:\n    paths:/);
  assert.match(workflow, /name: Retain summary[^\n]*\n\s+if: always\(\)/);
  assert.match(workflow, /name: Upload dated report and summary\n\s+if: always\(\)/);
  assert.ok(workflow.includes('GITHUB_STEP_SUMMARY'));
  assert.ok(workflow.includes('checker-produced-no-report'));
  assert.match(workflow, /if-no-files-found: error/);
});

test('a Go binary root module without a version is recorded, and nothing else versionless passes', () => {
  const withRoot = (pkg) => { const f = trivyFixture(); f.Results.push({ Class: 'lang-pkgs', Type: 'gobinary', Target: 'usr/bin/tool', Packages: [pkg, { Name: 'golang.org/x/net', Version: 'v0.30.0' }] }); return f; };
  const root = parseTrivyReport(withRoot({ Name: 'github.com/example/tool', Relationship: 'root' }), image, resolved, TRIVY.version);
  assert.equal(root.status, 'clean');
  assert.deepEqual(root.unversionedRoots, ['github.com/example/tool']);
  assert.throws(() => parseTrivyReport(withRoot({ Name: 'github.com/example/dep', Relationship: 'direct' }), image, resolved, TRIVY.version), /incomplete-container-package/);
  const npmRoot = trivyFixture(); npmRoot.Results[1].Packages.push({ Name: 'root-without-version', Relationship: 'root' });
  assert.throws(() => parseTrivyReport(npmRoot, image, resolved, TRIVY.version), /incomplete-container-package/);
});

test('an OS package result holding only an unversioned root never passes', () => {
  const f = trivyFixture();
  f.Results = [{ Class: 'os-pkgs', Type: 'gobinary', Packages: [{ Name: 'example/root', Relationship: 'root' }] }];
  assert.throws(() => parseTrivyReport(f, image, resolved, TRIVY.version), /incomplete-container-package/);
});
