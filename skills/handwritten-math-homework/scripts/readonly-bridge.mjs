import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const READ_COMMANDS = new Set([
  'catalog', 'open_assignment', 'open_question',
  'capture_question', 'inspect_upload', 'pending_assignments'
]);

export async function connectorOrigin() {
  const file = new URL('../assets/x-schedule-connector/manifest.json', import.meta.url);
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  if (typeof manifest.key !== 'string') throw new Error('Missing public extension key');
  const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
  return 'chrome-extension://' + [...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

export async function createReadOnlyBridge({ port = 17321, timeoutMs = 75000 } = {}) {
  const origin = await connectorOrigin();
  const token = randomBytes(24).toString('hex');
  let pending = null, closed = false, actualPort;
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (req.headers.origin !== origin || req.headers.host !== '127.0.0.1:' + actualPort) {
      send(403, { error: 'Origin or Host mismatch' }); return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'POST' && req.url === '/session') { send(200, { token }); return; }
    if (req.headers.authorization !== 'Bearer ' + token) {
      send(403, { error: 'Authentication required' }); return;
    }
    if (req.method === 'GET' && req.url === '/command') {
      send(200, pending ? { id: pending.id, command: pending.command, args: pending.args } : {});
      return;
    }
    if (req.method === 'POST' && req.url === '/result') {
      try {
        let length = 0; const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 3000000) throw new Error('Result exceeds 3 MB');
          chunks.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!pending || value.id !== pending.id) { send(409, { error: 'Unknown command id' }); return; }
        const task = pending; pending = null; clearTimeout(task.timer);
        if (value.error) task.reject(new Error(String(value.error).slice(0, 500)));
        else task.resolve(value.result);
        send(200, {});
      } catch (error) {
        if (!res.headersSent) send(400, { error: error.message });
      }
      return;
    }
    send(404, { error: 'Unknown route' });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      actualPort = server.address().port;
      resolve();
    });
  });
  return {
    origin, port: actualPort,
    execute(command, args = {}) {
      return new Promise((resolve, reject) => {
        if (!READ_COMMANDS.has(command)) { reject(new Error('Read-only bridge: command rejected')); return; }
        if (closed || pending) { reject(new Error('Bridge closed or busy')); return; }
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
          reject(new Error('args must be an object')); return;
        }
        const timer = setTimeout(() => {
          if (!pending) return;
          pending = null;
          reject(new Error('Connector timeout; check live login and connection before retrying'));
        }, timeoutMs);
        pending = { id: randomUUID(), command, args, resolve, reject, timer };
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      if (pending) {
        const task = pending; pending = null; clearTimeout(task.timer);
        task.reject(new Error('Bridge closed'));
      }
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('Read-only X Schedule bridge. JSONL stdin: {command,args,saveTo?}. Port 17321. No upload or submit.\n');
    return;
  }
  const bridge = await createReadOnlyBridge();
  process.stderr.write('BRIDGE_READY 127.0.0.1:' + bridge.port + ' ' + bridge.origin + '\n');
  const lines = readline.createInterface({ input: process.stdin });
  const stop = () => { lines.close(); void bridge.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let command;
      try {
        if (line.length > 65536) throw new Error('Input line too large');
        const value = JSON.parse(line); command = value.command;
        if (value.saveTo && !path.isAbsolute(value.saveTo)) throw new Error('saveTo must be absolute');
        const result = await bridge.execute(command, value.args || {});
        if (value.saveTo) await fs.writeFile(value.saveTo, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        process.stdout.write(JSON.stringify({ command, result: value.saveTo ? { saved: value.saveTo } : result }) + '\n');
      } catch (error) {
        process.stdout.write(JSON.stringify({ command, error: error.message }) + '\n');
      }
    }
  } finally { await bridge.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}

