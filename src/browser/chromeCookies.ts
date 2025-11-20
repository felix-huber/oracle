import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import chromeCookies from 'chrome-cookies-secure';
import { COOKIE_URLS } from './constants.js';
import type { CookieParam } from './types.js';
import './keytarShim.js';

export interface LoadChromeCookiesOptions {
  targetUrl: string;
  profile?: string | null;
  explicitCookiePath?: string | null;
  filterNames?: Set<string>;
}

export async function loadChromeCookies({
  targetUrl,
  profile,
  explicitCookiePath,
  filterNames,
}: LoadChromeCookiesOptions): Promise<CookieParam[]> {
  const urlsToCheck = Array.from(new Set([stripQuery(targetUrl), ...COOKIE_URLS]));
  const merged = new Map<string, CookieParam>();
  const cookieFile = await resolveCookieFilePath({ explicitPath: explicitCookiePath, profile });

  for (const url of urlsToCheck) {
    const raw = await chromeCookies.getCookiesPromised(url, 'puppeteer', cookieFile);
    if (!Array.isArray(raw)) continue;
    const fallbackHost = new URL(url).hostname;
    for (const cookie of raw) {
      if (filterNames && filterNames.size > 0 && !filterNames.has(cookie.name)) continue;
      const normalized = normalizeCookie(cookie, fallbackHost);
      if (!normalized) continue;
      const key = `${normalized.domain ?? fallbackHost}:${normalized.name}`;
      if (!merged.has(key)) {
        merged.set(key, normalized);
      }
    }
  }
  return Array.from(merged.values());
}

function normalizeCookie(
  cookie: {
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    expires?: number;
    // biome-ignore lint/style/useNamingConvention: matches Chrome cookie fields
    Secure?: boolean;
    // biome-ignore lint/style/useNamingConvention: matches Chrome cookie fields
    HttpOnly?: boolean;
  },
  fallbackHost: string,
): CookieParam | null {
  if (!cookie?.name) return null;
  const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain ?? fallbackHost;
  const expires = normalizeExpiration(cookie.expires);
  const secure = typeof cookie.Secure === 'boolean' ? cookie.Secure : true;
  const httpOnly = typeof cookie.HttpOnly === 'boolean' ? cookie.HttpOnly : false;
  return {
    name: cookie.name,
    value: cleanValue(cookie.value ?? ''),
    domain,
    path: cookie.path ?? '/',
    expires,
    secure,
    httpOnly,
  };
}

function cleanValue(value: string): string {
  let i = 0;
  while (i < value.length && value.charCodeAt(i) < 0x20) i += 1;
  return value.slice(i);
}

function normalizeExpiration(expires?: number): number | undefined {
  if (!expires || Number.isNaN(expires)) {
    return undefined;
  }
  const value = Number(expires);
  if (value <= 0) return undefined;
  if (value > 1_000_000_000_000) {
    return Math.round(value / 1_000_000 - 11644473600);
  }
  if (value > 1_000_000_000) {
    return Math.round(value / 1000);
  }
  return Math.round(value);
}

async function resolveCookieFilePath({
  explicitPath,
  profile,
}: {
  explicitPath?: string | null;
  profile?: string | null;
}): Promise<string> {
  if (explicitPath && explicitPath.trim().length > 0) {
    return ensureCookieFile(explicitPath);
  }
  if (profile && looksLikePath(profile)) {
    return ensureCookieFile(profile);
  }
  const profileName = profile && profile.trim().length > 0 ? profile : 'Default';
  const baseDir = await defaultProfileRoot();
  return ensureCookieFile(path.join(baseDir, profileName));
}

async function ensureCookieFile(inputPath: string): Promise<string> {
  const expanded = expandPath(inputPath);
  const stat = await fs.stat(expanded).catch(() => null);
  if (!stat) {
    throw new Error(`Unable to locate Chrome cookie DB at ${expanded}`);
  }
  if (stat.isDirectory()) {
    const directFile = path.join(expanded, 'Cookies');
    if (await fileExists(directFile)) return directFile;
    const networkFile = path.join(expanded, 'Network', 'Cookies');
    if (await fileExists(networkFile)) return networkFile;
    throw new Error(`No Cookies DB found under ${expanded}`);
  }
  return expanded;
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

function expandPath(input: string): string {
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
}

function looksLikePath(value: string): boolean {
  return value.includes('/') || value.includes('\\');
}

async function defaultProfileRoot(): Promise<string> {
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    candidates.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Chromium'),
    );
  } else if (process.platform === 'linux') {
    candidates.push(
      path.join(os.homedir(), '.config', 'google-chrome'),
      path.join(os.homedir(), '.config', 'microsoft-edge'),
      path.join(os.homedir(), '.config', 'chromium'),
    );
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(
      path.join(localAppData, 'Google', 'Chrome', 'User Data'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
      path.join(localAppData, 'Chromium', 'User Data'),
    );
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  // fallback: first candidate even if missing; upstream will throw clearer error
  return candidates[0];
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export const testExports = {
  normalizeExpiration,
  cleanValue,
  looksLikePath,
  defaultProfileRoot,
};
