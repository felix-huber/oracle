import { COOKIE_URLS } from './constants.js';
import { loadChromeCookies } from './chromeCookies.js';
export class ChromeCookieSyncError extends Error {
}
export async function syncCookies(Network, url, profile, logger, options = {}) {
    const { allowErrors = false, filterNames, inlineCookies, cookiePath } = options;
    try {
        const cookies = inlineCookies?.length
            ? normalizeInlineCookies(inlineCookies, new URL(url).hostname)
            : await readChromeCookies(url, profile, filterNames ?? undefined, cookiePath ?? undefined);
        if (!cookies.length) {
            return 0;
        }
        let applied = 0;
        for (const cookie of cookies) {
            const cookieWithUrl = attachUrl(cookie, url);
            try {
                const result = await Network.setCookie(cookieWithUrl);
                if (result?.success) {
                    applied += 1;
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger(`Failed to set cookie ${cookie.name}: ${message}`);
            }
        }
        return applied;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (allowErrors) {
            logger(`Cookie sync failed (continuing with override): ${message}`);
            return 0;
        }
        throw error instanceof ChromeCookieSyncError ? error : new ChromeCookieSyncError(message);
    }
}
async function readChromeCookies(url, profile, filterNames, cookiePath) {
    const urlsToCheck = Array.from(new Set([stripQuery(url), ...COOKIE_URLS]));
    const merged = new Map();
    const allowlist = normalizeCookieNames(filterNames);
    for (const candidateUrl of urlsToCheck) {
        const cookies = await loadChromeCookies({
            targetUrl: candidateUrl,
            profile: profile ?? undefined,
            explicitCookiePath: cookiePath ?? undefined,
            filterNames: allowlist ?? undefined,
        });
        const fallbackHostname = new URL(candidateUrl).hostname;
        for (const cookie of cookies) {
            const key = `${cookie.domain ?? fallbackHostname}:${cookie.name}`;
            if (!merged.has(key)) {
                merged.set(key, cookie);
            }
        }
    }
    return Array.from(merged.values());
}
function normalizeInlineCookies(rawCookies, fallbackHost) {
    const merged = new Map();
    for (const cookie of rawCookies) {
        if (!cookie?.name)
            continue;
        const normalized = {
            ...cookie,
            name: cookie.name,
            value: cookie.value ?? '',
            domain: cookie.domain ?? fallbackHost,
            path: cookie.path ?? '/',
            expires: normalizeExpiration(cookie.expires),
            secure: cookie.secure ?? true,
            httpOnly: cookie.httpOnly ?? false,
        };
        const key = `${normalized.domain ?? fallbackHost}:${normalized.name}`;
        if (!merged.has(key)) {
            merged.set(key, normalized);
        }
    }
    return Array.from(merged.values());
}
function normalizeCookieNames(names) {
    if (!names || names.length === 0) {
        return null;
    }
    return new Set(names.map((name) => name.trim()).filter(Boolean));
}
function attachUrl(cookie, fallbackUrl) {
    const cookieWithUrl = { ...cookie };
    if (!cookieWithUrl.url) {
        if (!cookieWithUrl.domain || cookieWithUrl.domain === 'localhost') {
            cookieWithUrl.url = fallbackUrl;
        }
        else if (!cookieWithUrl.domain.startsWith('.')) {
            cookieWithUrl.url = `https://${cookieWithUrl.domain}`;
        }
    }
    // When url is present, let Chrome derive the host from it; keeping domain can trigger CDP sanitization errors.
    if (cookieWithUrl.url) {
        delete cookieWithUrl.domain;
    }
    return cookieWithUrl;
}
function stripQuery(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        parsed.search = '';
        return parsed.toString();
    }
    catch {
        return url;
    }
}
function normalizeExpiration(expires) {
    if (!expires || Number.isNaN(expires)) {
        return undefined;
    }
    const value = Number(expires);
    if (value <= 0) {
        return undefined;
    }
    if (value > 1_000_000_000_000) {
        return Math.round(value / 1_000_000 - 11644473600);
    }
    if (value > 1_000_000_000) {
        return Math.round(value / 1000);
    }
    return Math.round(value);
}
