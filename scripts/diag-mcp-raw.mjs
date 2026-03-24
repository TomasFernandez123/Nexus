#!/usr/bin/env node

import { spawn } from 'node:child_process';

const MCP_CMD = process.env.MCP_CMD ?? 'npx --yes nexus mcp stdio';
const TRANSPORT = (process.env.MCP_TRANSPORT ?? 'line').toLowerCase() === 'framed' ? 'framed' : 'line';
const STEP_TIMEOUT_MS = Number(process.env.MCP_STEP_TIMEOUT_MS ?? '8000');

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const log = (message, extra) => {
  if (extra === undefined) {
    process.stdout.write(`[${nowIso()}] ${message}\n`);
    return;
  }
  process.stdout.write(`[${nowIso()}] ${message} ${JSON.stringify(extra)}\n`);
};

const summarizeResultShape = (msg) => {
  const out = {
    hasErrorEnvelope: Object.prototype.hasOwnProperty.call(msg, 'error'),
    hasResultEnvelope: Object.prototype.hasOwnProperty.call(msg, 'result'),
    hasResultContent: false,
    hasResultStructuredContent: false,
    resultType: 'none',
    notes: [],
  };

  if (Object.prototype.hasOwnProperty.call(msg, 'error')) {
    out.notes.push('jsonrpc.error envelope present');
  }

  if (Object.prototype.hasOwnProperty.call(msg, 'result')) {
    out.resultType = Array.isArray(msg.result) ? 'array' : typeof msg.result;
    if (msg.result && typeof msg.result === 'object') {
      out.hasResultContent = Object.prototype.hasOwnProperty.call(msg.result, 'content');
      out.hasResultStructuredContent = Object.prototype.hasOwnProperty.call(msg.result, 'structuredContent');

      if (!out.hasResultContent && !out.hasResultStructuredContent) {
        out.notes.push('raw payload likely returned directly in result');
      }
      if (msg.result?.isError === true) {
        out.notes.push('tool-level error signaled via result.isError');
      }
    } else {
      out.notes.push('result is primitive/array, no MCP tool wrapper shape');
    }
  }

  return out;
};

const extractNextPayload = (buffer) => {
  const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 64)).trimStart().toLowerCase();
  if (preview.startsWith('content-length:')) {
    const sep = buffer.indexOf('\r\n\r\n');
    if (sep === -1) return null;
    const headers = buffer.slice(0, sep).toString('utf8');
    const line = headers
      .split('\r\n')
      .find((entry) => entry.toLowerCase().startsWith('content-length:'));
    if (!line) throw new Error('Invalid framed message: missing Content-Length header');
    const len = Number(line.slice('content-length:'.length).trim());
    if (!Number.isInteger(len) || len < 0) throw new Error('Invalid Content-Length value');
    const bodyStart = sep + 4;
    const bodyEnd = bodyStart + len;
    if (buffer.length < bodyEnd) return null;
    return {
      mode: 'framed',
      payload: buffer.slice(bodyStart, bodyEnd).toString('utf8'),
      rest: buffer.slice(bodyEnd),
    };
  }

  const nl = buffer.indexOf(0x0a);
  if (nl === -1) return null;
  return {
    mode: 'line',
    payload: buffer.slice(0, nl).toString('utf8').trim(),
    rest: buffer.slice(nl + 1),
  };
};

const sendPayload = (stdin, payload) => {
  if (TRANSPORT === 'framed') {
    stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    return;
  }
  stdin.write(`${payload}\n`);
};

const main = async () => {
  log('starting MCP raw diag', { cmd: MCP_CMD, transport: TRANSPORT, timeoutMs: STEP_TIMEOUT_MS });
  const child = spawn(MCP_CMD, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });

  let readBuffer = Buffer.alloc(0);
  let sawAnyStdout = false;
  const pending = new Map();
  const traces = [];
  let currentInboundMode = 'unknown';

  const settlePending = (id, msg, raw, inboundMode) => {
    const wait = pending.get(id);
    if (!wait) return;
    pending.delete(id);
    wait.resolve({ msg, raw, inboundMode });
  };

  child.stdout.on('data', (chunk) => {
    sawAnyStdout = true;
    readBuffer = Buffer.concat([readBuffer, Buffer.from(chunk)]);

    while (true) {
      let next;
      try {
        next = extractNextPayload(readBuffer);
      } catch (error) {
        log('parser error (incoming payload)', { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (!next) break;

      readBuffer = next.rest;
      currentInboundMode = next.mode;
      if (!next.payload) continue;

      let parsed;
      try {
        parsed = JSON.parse(next.payload);
      } catch {
        log('non-json stdout payload', { raw: next.payload });
        continue;
      }

      const id = parsed?.id;
      log('<- response', { id, inboundMode: next.mode, raw: parsed });
      settlePending(id, parsed, next.payload, next.mode);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim();
    if (text.length > 0) {
      log('stderr', { text });
    }
  });

  child.on('exit', (code, signal) => {
    log('child exit', { code, signal });
    for (const wait of pending.values()) {
      wait.reject(new Error(`child exited before response (code=${String(code)}, signal=${String(signal)})`));
    }
    pending.clear();
  });

  const call = (stepName, request) =>
    new Promise((resolve, reject) => {
      const started = nowMs();
      const raw = JSON.stringify(request);
      log('-> request', { step: stepName, id: request.id, raw: request });

      const timeout = setTimeout(() => {
        pending.delete(request.id);
        const elapsed = nowMs() - started;
        traces.push({ step: stepName, id: request.id, ok: false, timeout: true, latencyMs: elapsed });
        log('TIMEOUT', { step: stepName, id: request.id, elapsedMs: elapsed });
        reject(new Error(`timeout waiting response for ${stepName}`));
      }, STEP_TIMEOUT_MS);

      pending.set(request.id, {
        resolve: (response) => {
          clearTimeout(timeout);
          const latency = nowMs() - started;
          const shape = summarizeResultShape(response.msg);
          traces.push({
            step: stepName,
            id: request.id,
            ok: true,
            timeout: false,
            latencyMs: latency,
            requestRaw: raw,
            responseRaw: response.raw,
            inboundMode: response.inboundMode,
            shape,
          });
          log('shape', { step: stepName, id: request.id, latencyMs: latency, shape });
          resolve(response.msg);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      sendPayload(child.stdin, raw);
    });

  const ts = Date.now();
  const sequence = [
    {
      step: 'initialize',
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'diag-mcp-raw', version: '0.1.0' } },
      },
    },
    { step: 'tools/list', request: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } },
    {
      step: 'tools/call runtime_info',
      request: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'runtime_info', arguments: {} } },
    },
    {
      step: 'tools/call task_list_pending {limit:100}',
      request: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'task_list_pending', arguments: { limit: 100 } },
      },
    },
    {
      step: 'tools/call task_create',
      request: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'task_create',
          arguments: { type: 'chore', title: `diag-mcp-raw-${ts}` },
        },
      },
    },
    {
      step: 'tools/call task_list_pending (after create)',
      request: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'task_list_pending', arguments: { limit: 100 } },
      },
    },
  ];

  let fatal = null;
  for (const item of sequence) {
    try {
      await call(item.step, item.request);
    } catch (error) {
      fatal = error;
      break;
    }
  }

  child.stdin.end();
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (!child.killed) {
    child.kill('SIGKILL');
  }

  const okCount = traces.filter((t) => t.ok).length;
  const timeoutCount = traces.filter((t) => t.timeout).length;
  log('--- SUMMARY ---');
  log('diag summary', {
    totalSteps: sequence.length,
    completedSteps: traces.length,
    okCount,
    timeoutCount,
    sawAnyStdout,
    inboundModeSeen: currentInboundMode,
  });

  for (const t of traces) {
    log('step', {
      step: t.step,
      id: t.id,
      ok: t.ok,
      timeout: t.timeout,
      latencyMs: t.latencyMs,
      shape: t.shape,
    });
  }

  if (fatal) {
    log('FAILED', { error: fatal instanceof Error ? fatal.message : String(fatal) });
    process.exitCode = 1;
    return;
  }

  log('DONE', { note: 'all steps completed' });
};

main().catch((error) => {
  log('fatal error', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
