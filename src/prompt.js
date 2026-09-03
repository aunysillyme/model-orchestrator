import { createInterface } from 'node:readline';

// A line-buffered asker. readline emits 'line' for piped input as soon as it
// arrives, whether or not a question is pending, so a naive question() loop
// drops answers that were typed (or piped) ahead. This queues them.
// EOF with no answer left is an abort, never a silent default: a pipe that
// ran out of lines must not confirm a write on the user's behalf.
export function makeAsker({ input, output }) {
  const rl = createInterface({ input, output, terminal: false });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  async function ask(question, fallback) {
    output.write(question);
    let line;
    if (queue.length) line = queue.shift();
    else if (closed) line = null;
    else line = await new Promise((res) => waiters.push(res));
    if (line === null) {
      output.write('\n');
      const e = new Error('input ended before the question was answered (use --yes with --level and --ais for non-interactive runs)');
      e.code = 'EOF';
      throw e;
    }
    line = line.trim();
    return line === '' ? fallback : line;
  }
  return { ask, close: () => rl.close() };
}
