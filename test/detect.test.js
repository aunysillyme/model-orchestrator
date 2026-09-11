// which() is the one place a lane binary is located, on the user's real PATH.
// A PATH entry on win32 never holds a bare "grok": npm and vendor installers
// drop "grok.cmd" (or .exe/.bat), so which() must try %PATHEXT% suffixes
// there. platform is a parameter (default process.platform), the same
// pattern bin/cli-run.mjs's killTree(pid, platform, deps) already uses, so
// the win32 branch has a real test on every OS this suite runs on, not just
// on a Windows runner.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { which, candidateExtensions } from '../src/detect.js';

function withPath(dir, run) {
  const original = process.env.PATH;
  process.env.PATH = dir;
  try {
    return run();
  } finally {
    process.env.PATH = original;
  }
}

// which() also falls back to ~/.local/bin etc. when PATH alone does not find
// the binary. A dev machine with a real vendor CLI already installed there
// (this one included) would otherwise leak into these tests as a false
// positive, since PATH is not the only place searched. An empty, real temp
// dir as "home" means those fallback paths resolve to nothing.
const FAKE_HOME = mkdtempSync(join(tmpdir(), 'orch-which-home-'));
after(() => rmSync(FAKE_HOME, { recursive: true, force: true }));

test('candidateExtensions: POSIX tries only the bare name, regardless of PATHEXT', () => {
  assert.deepEqual(candidateExtensions('darwin', '.COM;.EXE'), ['']);
  assert.deepEqual(candidateExtensions('linux'), ['']);
});

test('candidateExtensions: win32 tries the bare name first, then each %PATHEXT% entry', () => {
  assert.deepEqual(candidateExtensions('win32', '.COM;.EXE;.BAT;.CMD'), ['', '.COM', '.EXE', '.BAT', '.CMD']);
});

test('candidateExtensions: win32 falls back to the documented default PATHEXT when empty or unset', () => {
  // An explicit '' (not undefined) is what actually proves the function's own
  // fallback: passing undefined triggers the DEFAULT PARAMETER, which reads
  // the live process.env.PATHEXT at call time, so on a real Windows machine
  // (where PATHEXT is always populated, usually with more than these four
  // entries) that assertion would depend on the host's own PATHEXT rather
  // than on which() ever seeing a falsy value at all.
  assert.deepEqual(candidateExtensions('win32', ''), ['', '.COM', '.EXE', '.BAT', '.CMD']);
});

test('which(): finds a bare-name file on the default (POSIX-shaped) platform', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-which-'));
  try {
    const bin = join(dir, 'grok');
    writeFileSync(bin, '#!/bin/sh\necho hi\n');
    chmodSync(bin, 0o755);
    withPath(dir, () => {
      assert.equal(which('grok', process.platform, FAKE_HOME), bin);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('which(): on win32, a bare name with no extension is never found once a real vendor drops grok.cmd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-which-win-'));
  try {
    // %PATHEXT%'s conventional casing is uppercase (".CMD"), which is what
    // candidateExtensions() constructs; the fixture matches that case on
    // purpose, so this test proves the candidate-generation logic itself
    // (does which() try the suffix at all?) rather than relying on NTFS's
    // case-insensitive lookup, a real-Windows-only property this suite
    // cannot exercise from a case-sensitive CI host (ext4 on Ubuntu).
    const bin = join(dir, 'grok.CMD');
    writeFileSync(bin, '@echo off\r\necho hi\r\n');
    chmodSync(bin, 0o755);
    withPath(dir, () => {
      assert.equal(which('grok', 'win32', FAKE_HOME), bin, 'which() must try %PATHEXT% suffixes on win32');
      assert.equal(which('grok', 'darwin', FAKE_HOME), null, 'the POSIX branch must not guess a Windows extension');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('which(): on win32, a bare-name match still wins over guessing an extension', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-which-bare-'));
  try {
    const bin = join(dir, 'grok');
    writeFileSync(bin, 'anything');
    chmodSync(bin, 0o755);
    withPath(dir, () => {
      assert.equal(which('grok', 'win32', FAKE_HOME), bin);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('which(): a directory named like the binary is never mistaken for it, on either platform', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-which-dir-'));
  try {
    // Uppercase to match candidateExtensions()'s own casing, so this
    // actually exercises "found a candidate, but it is a directory" on a
    // case-sensitive host too, rather than missing the candidate entirely.
    const fakeDir = join(dir, 'grok.CMD');
    mkdirSync(fakeDir);
    withPath(dir, () => {
      assert.equal(which('grok', 'win32', FAKE_HOME), null);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
