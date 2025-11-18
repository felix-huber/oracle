import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = path.join(process.cwd(), 'dist/bin/oracle-mcp.js');

describe('oracle-mcp schemas', () => {
  const client = new Client({ name: 'schema-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    stderr: 'pipe',
    cwd: path.dirname(entry),
  });

  beforeAll(async () => {
    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client.close().catch(() => {});
  });

  it('fails schema export today (track until fixed)', async () => {
    await expect(client.listTools({ server: {} }, { timeoutMs: 10_000 })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ expected: 'object' }),
      ]),
    });
  });
});
