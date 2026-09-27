// Capture real fixture output, then render a terminal GIF with an already installed agg.
// The recorder installs no tools and leaves the repository's promo trailer untouched.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clean, ROOT, run, scratch } from './lib.js';

const dir = scratch();
try {
  const file = join(dir, 'checks.json');
  writeFileSync(file, JSON.stringify({ version: 1, checks: [{ id: 'output-exists', command: ['node', '-e', 'process.exit(require("node:fs").existsSync("output.txt") ? 0 : 1)'] }] }));
  const before = run([join(ROOT, 'bin', 'aunx.js'), 'checks', 'run', file], { cwd: dir });
  if (before.status !== 1) throw new Error('Expected the missing-output check to fail');
  const create = run(['-e', 'require("node:fs").writeFileSync("output.txt", "verified output")'], { cwd: dir });
  if (create.status !== 0) throw new Error('Could not create the fixture output');
  const after = run([join(ROOT, 'bin', 'aunx.js'), 'checks', 'run', file], { cwd: dir });
  if (after.status !== 0) throw new Error('Expected the existing-output check to pass');
  const terminal = s => s.replace(/\r?\n/g, '\r\n');
  const events = [
    { version: 2, width: 86, height: 15, title: 'Acceptance checks: red, then green', env: { TERM: 'xterm-256color' } },
    [0, 'o', '\u001b[1;32m$\u001b[0m aunx checks run checks.json\r\n'],
    [0.6, 'o', '\u001b[31m' + terminal(before.stdout) + '\u001b[0m'],
    [1.2, 'o', '$ echo $?\r\n' + before.status + '\r\n'],
    [3, 'o', '\r\n$ node -e \'require("node:fs").writeFileSync("output.txt","verified output")\'\r\n'],
    [4.5, 'o', '\r\n\u001b[1;32m$\u001b[0m aunx checks run checks.json\r\n'],
    [5, 'o', '\u001b[32m' + terminal(after.stdout) + '\u001b[0m'],
    [5.5, 'o', '$ echo $?\r\n' + after.status + '\r\n'],
    [7, 'o', '\r\nThe exit code gates the next command in your release sequence.\r\n']
  ];
  const cast = join(ROOT, 'proof', 'gate-demo.cast');
  const gif = join(ROOT, 'proof', 'gate-demo.gif');
  writeFileSync(cast, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  const rendered = spawnSync('agg', ['--theme', 'monokai', '--font-size', '18', '--last-frame-duration', '3', cast, gif], { encoding: 'utf8', timeout: 60000 });
  if (rendered.error || rendered.status !== 0) {
    throw new Error(`The cast is saved. To render the GIF, install agg yourself from https://github.com/asciinema/agg and run this script again. ${rendered.error?.code || rendered.stderr}`);
  }
  console.log('Recorded proof/gate-demo.cast and proof/gate-demo.gif from real failing and passing commands.');
} finally { clean(dir); }
