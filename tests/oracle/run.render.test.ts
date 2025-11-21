import { describe, expect, it, vi } from 'vitest';

import type { RunOracleOptions, RunOracleDeps, OracleResponse } from '../../src/oracle.js';

async function loadRunOracleWithTty(isTty: boolean) {
  const originalTty = (process.stdout as { isTTY?: boolean }).isTTY;
  const originalForceColor = process.env.FORCE_COLOR;
  (process.stdout as { isTTY?: boolean }).isTTY = isTty;
  process.env.FORCE_COLOR = '1';
  vi.resetModules();
  const { runOracle } = await import('../../src/oracle/run.js');
  return {
    runOracle,
    restore: () => {
      (process.stdout as { isTTY?: boolean }).isTTY = originalTty;
      if (originalForceColor === undefined) {
        delete process.env.FORCE_COLOR;
      } else {
        process.env.FORCE_COLOR = originalForceColor;
      }
    },
  };
}

function makeStreamingClient(delta: string): RunOracleDeps['clientFactory'] {
  const finalResponse: OracleResponse = {
    id: 'resp-1',
    status: 'completed',
    usage: { input_tokens: 0, output_tokens: delta.length, total_tokens: delta.length },
    output: [{ type: 'text', text: delta }],
  };
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield { type: 'chunk', delta };
    },
    finalResponse: async () => finalResponse,
  };
  return () => ({
    responses: {
      stream: () => stream,
      create: vi.fn(),
      retrieve: vi.fn().mockResolvedValue(finalResponse),
    },
  });
}

describe('runOracle streaming rendering', () => {
  const baseOptions: RunOracleOptions = {
    prompt: 'p',
    model: 'gpt-5.1',
    search: false,
  };

  it('renders streamed markdown once in rich TTY by default', async () => {
    const { runOracle, restore } = await loadRunOracleWithTty(true);
    const logSink: string[] = [];
    const stdoutSink: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdoutSink.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    await runOracle(baseOptions, {
      clientFactory: makeStreamingClient('# Title\n- item'),
      write: (text) => {
        logSink.push(text);
        return true;
      },
      wait: async () => {},
    });

    const rendered = stdoutSink.join('');
    const combined = rendered + logSink.join('');
    expect(combined).toContain('# Title');
    expect(rendered.length).toBeGreaterThan(0); // stdout receives rendered markdown on TTY
    stdoutSpy.mockRestore();
    restore();
  });

  it('streams raw text immediately when --render-plain is used', async () => {
    const { runOracle, restore } = await loadRunOracleWithTty(true);
    const sink: string[] = [];
    const stdoutSink: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdoutSink.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    await runOracle({ ...baseOptions, renderPlain: true }, {
      clientFactory: makeStreamingClient('# Title\n- item'),
      write: (text) => {
        sink.push(String(text));
        return true;
      },
      wait: async () => {},
    });

    const output = sink.join('');
    const rendered = stdoutSink.join('');
    expect(output).toContain('# Title');
    expect(rendered).toContain('# Title');
    expect(rendered).not.toContain('\u001b[');
    stdoutSpy.mockRestore();
    restore();
  });
});
