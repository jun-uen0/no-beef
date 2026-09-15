#!/usr/bin/env node
// Reference native messaging host for no-beef.
//
// It is deliberately not an agent. It speaks Chrome's framing on one side and
// a dead-simple JSON-on-stdin/stdout contract on the other, so that plugging in
// whatever you actually run — Claude Code, a local server, a shell script — is
// a matter of pointing it at a command rather than editing this file.
//
//   Chrome  <--4-byte-length-prefixed JSON-->  this host  <--JSON lines-->  your command
//
// Configure it by creating host/agent.config.json next to this file:
//
//   { "command": ["/absolute/path/to/your-agent.sh"] }
//
// Your command is spawned per request, receives the request JSON on stdin, and
// must print the response JSON on stdout:
//
//   in : {"op":"classify","text":"...","lang":"ja"}
//   out: {"severity":"harmful","score":0.9}
//
//   in : {"op":"rewrite","text":"...","lang":"ja"}
//   out: {"rewritten":"..."}
//
// With no config file it answers {} to everything, which the extension reads as
// "no opinion" and falls back to the stages it already has. That is the correct
// behaviour for an unconfigured host: never invent a verdict.
//
// Test it without Chrome — see host/README.md.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'agent.config.json');
/** Chrome's own cap on a single message. */
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
/** A hung agent must not leave the extension's port open; it gives up at 20s anyway. */
const AGENT_TIMEOUT_MS = 15_000;

function log(message) {
  // stderr only. Anything on stdout is framed protocol and would corrupt it.
  process.stderr.write(`[no-beef-host] ${message}\n`);
}

function readConfig() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (!Array.isArray(parsed.command) || parsed.command.length === 0) {
      log('agent.config.json has no "command" array; answering with no opinion');
      return null;
    }
    return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') log(`could not read agent.config.json: ${err.message}`);
    return null;
  }
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function runAgent(config, request) {
  return new Promise((resolve) => {
    const [command, ...args] = config.command;
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });

    let out = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      log('agent timed out; answering with no opinion');
      finish({});
    }, AGENT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', (err) => {
      log(`could not run agent: ${err.message}`);
      finish({});
    });
    child.on('close', () => {
      try {
        finish(JSON.parse(out));
      } catch {
        // The extension validates every field anyway, but answering with
        // something shaped like a verdict when the agent printed prose would
        // be worse than admitting there is nothing to report.
        log('agent did not print JSON; answering with no opinion');
        finish({});
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

async function handle(request) {
  if (request?.op !== 'classify' && request?.op !== 'rewrite') {
    log(`unknown op: ${JSON.stringify(request?.op)}`);
    return {};
  }
  const config = readConfig();
  if (!config) return {};
  return await runAgent(config, request);
}

// Chrome writes a 4-byte little-endian length followed by that many bytes of
// UTF-8 JSON. Messages can arrive split across reads or several at a time, so
// the buffer is drained in a loop rather than assumed to hold exactly one.
let buffer = Buffer.alloc(0);
let handling = Promise.resolve();

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  for (;;) {
    if (buffer.length < 4) return;
    const length = buffer.readUInt32LE(0);
    if (length > MAX_MESSAGE_BYTES) {
      log(`message of ${length} bytes is implausible; closing`);
      process.exit(1);
    }
    if (buffer.length < 4 + length) return;

    const body = buffer.subarray(4, 4 + length).toString('utf8');
    buffer = buffer.subarray(4 + length);

    // Serialise the work: two agents running at once would interleave their
    // output on a shared stdout.
    handling = handling.then(async () => {
      let request = null;
      try {
        request = JSON.parse(body);
      } catch {
        log('received malformed JSON');
        send({});
        return;
      }
      send(await handle(request));
    });
  }
});

process.stdin.on('end', () => {
  handling.then(() => process.exit(0));
});
