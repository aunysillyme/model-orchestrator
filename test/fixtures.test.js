// The judges, run against output real vendor CLIs actually produced.
//
// judges.test.js proves the judges against shapes written by hand. Those shapes
// are only as good as the author's memory of the vendor, and #11 asked for the
// difference to be closed. These fixtures were captured from real runs at
// recorded versions; test/fixtures/README.md says how, and manifest.json says
// with which flags and what each one is for.
//
// The point is not extra coverage. It is that a hand-written fixture cannot
// surprise you, and a real one can: codex 0.153.4 emitted an `item.completed`
// whose item is `type: "error"` before `turn.completed`, which no synthetic
// fixture in this repository contained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from '../bin/cli-run.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('every fixture in the manifest is judged the way the manifest says', () => {
  assert.ok(manifest.fixtures.length >= 5, 'manifest should list every captured lane');
  for (const f of manifest.fixtures) {
    const out = read(f.file);
    // codex is the one judge that also reads the -o file; the others take stdout.
    const outFile = f.outFile ? join(DIR, f.outFile) : null;
    const r = judge(f.lane, f.rc, out, '', outFile);
    if (f.expect === 'deliverable') {
      assert.ok(r.text, `${f.lane} ${f.vendorVersion}: expected a deliverable, got ${r.reason}: ${r.detail}`);
      assert.match(r.text, /OK/, `${f.lane}: the deliverable should carry the model's answer`);
    } else {
      assert.equal(r.text, null, `${f.lane} ${f.vendorVersion}: expected a refusal, got text ${JSON.stringify(r.text)}`);
      assert.ok(r.reason, `${f.lane}: a refusal must carry a reason code`);
    }
  }
});

test('codex: a real error item before turn.completed does not sink a good run', () => {
  const out = read('codex-0.153.4.jsonl');
  assert.match(out, /"type":"error"/, 'this fixture exists because the real capture contained an error item');
  assert.match(out, /"type":"turn\.completed"/, 'and a terminal event after it');
  const r = judge('codex', 0, out, '', join(DIR, 'codex-0.153.4.out.txt'));
  assert.ok(r.text, 'the error item is a vendor warning, not a failed turn: ' + r.detail);
});

test('agy: a real response keeps its trailing newline, so the judge must not equality-check', () => {
  const parsed = read('agy-1.1.27.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const result = parsed.find((e) => e.event === 'result');
  assert.equal(result.result.response, 'OK\n', 'captured verbatim, newline included');
  assert.ok(judge('agy', 0, read('agy-1.1.27.jsonl'), '', null).text);
});

test('qwen: the captured failure is a real one and is refused', () => {
  const out = read('qwen-0.22.3-nokey.json');
  assert.match(out, /"is_error":true/);
  const r = judge('qwen', 1, out, '', null);
  assert.equal(r.text, null, 'a vendor error must never read as a deliverable');
});

test('fixtures carry no session ids and no personal paths', () => {
  const files = manifest.fixtures.flatMap((f) => [f.file, f.outFile].filter(Boolean));
  for (const f of files) {
    const t = read(f);
    const uuids = t.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g) || [];
    for (const u of uuids) assert.equal(u, '00000000-0000-0000-0000-000000000000', `${f} leaked a real id`);
    assert.doesNotMatch(t, /\/Users\/[a-z]/i, `${f} leaked a home directory`);
  }
});

test('the manifest records a version and flags for every fixture, and states its gaps', () => {
  for (const f of manifest.fixtures) {
    assert.ok(f.vendorVersion, `${f.lane} must record the vendor version it was captured from`);
    assert.ok(Array.isArray(f.flags) && f.flags.length, `${f.lane} must record the flags used`);
    assert.ok(f.covers, `${f.lane} must say what the fixture is for`);
  }
  assert.ok(manifest.gaps.length, 'an unfinished capture is stated, never omitted');
});
