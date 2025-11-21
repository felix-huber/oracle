import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

async function importFreshClient() {
  vi.resetModules();
  return import('../../src/oracle/client.js');
}

describe('createDefaultClientFactory', () => {
  afterEach(() => {
    delete process.env.ORACLE_CLIENT_FACTORY;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  test('falls back to default factory and warns when custom factory export is invalid', async () => {
    process.env.ORACLE_CLIENT_FACTORY = '/nonexistent/path.js';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { createDefaultClientFactory } = await importFreshClient();
    const factory = createDefaultClientFactory();
    expect(typeof factory).toBe('function');
    expect(warn).toHaveBeenCalledOnce();
  });

});
