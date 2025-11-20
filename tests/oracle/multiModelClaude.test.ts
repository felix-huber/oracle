import { describe, expect, it, vi } from 'vitest';
import { runMultiModelApiSession } from '../../src/oracle/multiModelRunner.js';
import type { RunOracleOptions, ModelName } from '../../src/oracle/types.js';

describe('runMultiModelApiSession', () => {
  it('keeps background off for Claude while allowing GPT to opt in', async () => {
    const sessionMeta = {
      id: 'sess-1',
      createdAt: new Date().toISOString(),
      prompt: 'test',
      status: 'pending',
      options: {},
    } as any;

    const seenBackground: Record<ModelName, boolean | undefined> = {
      'gpt-5.1-pro': undefined,
      'gpt-5.1': undefined,
      'gpt-5.1-codex': undefined,
      'gemini-3-pro': undefined,
      'claude-4.5-sonnet': undefined,
      'claude-4.1-opus': undefined,
    } as Record<ModelName, boolean | undefined>;

    const mockRunOracle = vi.fn(async (opts: RunOracleOptions) => {
      seenBackground[opts.model] = opts.background;
      return {
        mode: 'live',
        response: { status: 'completed', output_text: ['ok'] },
        usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
        elapsedMs: 10,
      } as any;
    });

    await runMultiModelApiSession(
      {
        sessionMeta,
        runOptions: { prompt: 'hello', model: 'gpt-5.1-pro', background: true, search: true },
        models: ['gpt-5.1-pro', 'claude-4.5-sonnet'],
        cwd: process.cwd(),
        version: 'test',
      },
      {
        runOracleImpl: mockRunOracle as any,
        store: {
          updateModelRun: async () => {},
          createLogWriter: () => ({ logPath: 'log', logLine: () => {}, writeChunk: () => {}, stream: { end: () => {} } }),
          updateSession: async () => {},
          getPaths: async () => ({ dir: '.' }),
        } as any,
        now: () => 0,
      },
    );

    expect(seenBackground['gpt-5.1-pro']).toBe(true);
    expect(seenBackground['claude-4.5-sonnet']).toBe(false); // forced off
  });
});
