import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = path.join(process.cwd(), 'dist/bin/oracle-mcp.js');

describe('oracle-mcp schemas', () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  const stderrLog: string[] = [];

  const attachStderr = (proc: ChildProcess | undefined): void => {
    proc?.stderr?.on('data', (chunk) => stderrLog.push(String(chunk)));
  };

  beforeAll(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidateClient = new Client({ name: 'schema-smoke', version: '0.0.0' });
      const candidateTransport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        stderr: 'pipe',
        cwd: path.dirname(entry),
      });
      try {
        await candidateClient.connect(candidateTransport);
        const proc = (candidateTransport as unknown as { proc?: ChildProcess }).proc;
        attachStderr(proc);
        client = candidateClient;
        transport = candidateTransport;
        return;
      } catch (error) {
        lastError = error;
        const proc = (candidateTransport as unknown as { proc?: ChildProcess }).proc;
        attachStderr(proc);
        proc?.kill?.('SIGKILL');
        await candidateClient.close().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    throw new Error(`oracle-mcp failed to start: ${stderrLog.join('') || String(lastError)}`);
  }, 20_000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    const proc = (transport as unknown as { proc?: ChildProcess })?.proc;
    proc?.kill?.('SIGKILL');
  });

  it('exposes object schemas for tools', async () => {
    if (!client) throw new Error('MCP client not connected');
    const { tools } = await client.listTools({}, { timeout: 10_000 });
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      for (const schema of [tool.inputSchema, tool.outputSchema]) {
        if (!schema) continue;
        expect(schema.type).toBe('object');
      }
    }
  });
});
