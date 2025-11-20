import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { DEFAULT_MODEL } from './oracle.js';
const ORACLE_HOME = process.env.ORACLE_HOME_DIR ?? path.join(os.homedir(), '.oracle');
const SESSIONS_DIR = path.join(ORACLE_HOME, 'sessions');
const METADATA_FILENAME = 'meta.json';
const LEGACY_SESSION_FILENAME = 'session.json';
const LEGACY_REQUEST_FILENAME = 'request.json';
const MODELS_DIRNAME = 'models';
const MODEL_JSON_EXTENSION = '.json';
const MODEL_LOG_EXTENSION = '.log';
const MAX_STATUS_LIMIT = 1000;
const ZOMBIE_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes
const DEFAULT_SLUG = 'session';
const MAX_SLUG_WORDS = 5;
const MIN_CUSTOM_SLUG_WORDS = 3;
const MAX_SLUG_WORD_LENGTH = 10;
async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
export async function ensureSessionStorage() {
    await ensureDir(SESSIONS_DIR);
}
function slugify(text, maxWords = MAX_SLUG_WORDS) {
    const normalized = text?.toLowerCase() ?? '';
    const words = normalized.match(/[a-z0-9]+/g) ?? [];
    const trimmed = words
        .slice(0, maxWords)
        .map((word) => word.slice(0, MAX_SLUG_WORD_LENGTH));
    return trimmed.length > 0 ? trimmed.join('-') : DEFAULT_SLUG;
}
function countSlugWords(slug) {
    return slug.split('-').filter(Boolean).length;
}
function normalizeCustomSlug(candidate) {
    const slug = slugify(candidate, MAX_SLUG_WORDS);
    const wordCount = countSlugWords(slug);
    if (wordCount < MIN_CUSTOM_SLUG_WORDS || wordCount > MAX_SLUG_WORDS) {
        throw new Error(`Custom slug must include between ${MIN_CUSTOM_SLUG_WORDS} and ${MAX_SLUG_WORDS} words.`);
    }
    return slug;
}
export function createSessionId(prompt, customSlug) {
    if (customSlug) {
        return normalizeCustomSlug(customSlug);
    }
    return slugify(prompt);
}
function sessionDir(id) {
    return path.join(SESSIONS_DIR, id);
}
function metaPath(id) {
    return path.join(sessionDir(id), METADATA_FILENAME);
}
function requestPath(id) {
    return path.join(sessionDir(id), LEGACY_REQUEST_FILENAME);
}
function legacySessionPath(id) {
    return path.join(sessionDir(id), LEGACY_SESSION_FILENAME);
}
function logPath(id) {
    return path.join(sessionDir(id), 'output.log');
}
function modelsDir(id) {
    return path.join(sessionDir(id), MODELS_DIRNAME);
}
function modelJsonPath(id, model) {
    return path.join(modelsDir(id), `${model}${MODEL_JSON_EXTENSION}`);
}
function modelLogPath(id, model) {
    return path.join(modelsDir(id), `${model}${MODEL_LOG_EXTENSION}`);
}
async function fileExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function ensureUniqueSessionId(baseSlug) {
    let candidate = baseSlug;
    let suffix = 2;
    while (await fileExists(sessionDir(candidate))) {
        candidate = `${baseSlug}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}
async function listModelRunFiles(sessionId) {
    const dir = modelsDir(sessionId);
    const entries = await fs.readdir(dir).catch(() => []);
    const result = [];
    for (const entry of entries) {
        if (!entry.endsWith(MODEL_JSON_EXTENSION)) {
            continue;
        }
        const jsonPath = path.join(dir, entry);
        try {
            const raw = await fs.readFile(jsonPath, 'utf8');
            const parsed = JSON.parse(raw);
            const normalized = ensureModelLogReference(sessionId, parsed);
            result.push(normalized);
        }
        catch {
            // ignore malformed model files
        }
    }
    return result;
}
function ensureModelLogReference(sessionId, record) {
    const logPathRelative = record.log?.path ?? path.relative(sessionDir(sessionId), modelLogPath(sessionId, record.model));
    return {
        ...record,
        log: { path: logPathRelative, bytes: record.log?.bytes },
    };
}
async function readModelRunFile(sessionId, model) {
    try {
        const raw = await fs.readFile(modelJsonPath(sessionId, model), 'utf8');
        const parsed = JSON.parse(raw);
        return ensureModelLogReference(sessionId, parsed);
    }
    catch {
        return null;
    }
}
export async function updateModelRunMetadata(sessionId, model, updates) {
    await ensureDir(modelsDir(sessionId));
    const existing = (await readModelRunFile(sessionId, model)) ?? {
        model,
        status: 'pending',
    };
    const next = ensureModelLogReference(sessionId, {
        ...existing,
        ...updates,
        model,
    });
    await fs.writeFile(modelJsonPath(sessionId, model), JSON.stringify(next, null, 2), 'utf8');
    return next;
}
export async function readModelRunMetadata(sessionId, model) {
    return readModelRunFile(sessionId, model);
}
export async function initializeSession(options, cwd, notifications) {
    await ensureSessionStorage();
    const baseSlug = createSessionId(options.prompt || DEFAULT_SLUG, options.slug);
    const sessionId = await ensureUniqueSessionId(baseSlug);
    const dir = sessionDir(sessionId);
    await ensureDir(dir);
    const mode = options.mode ?? 'api';
    const browserConfig = options.browserConfig;
    const modelList = Array.isArray(options.models) && options.models.length > 0
        ? options.models
        : options.model
            ? [options.model]
            : [];
    const metadata = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        status: 'pending',
        promptPreview: (options.prompt || '').slice(0, 160),
        model: modelList[0] ?? options.model,
        models: modelList.map((modelName) => ({
            model: modelName,
            status: 'pending',
        })),
        cwd,
        mode,
        browser: browserConfig ? { config: browserConfig } : undefined,
        notifications,
        options: {
            prompt: options.prompt,
            file: options.file ?? [],
            model: options.model,
            models: modelList,
            maxInput: options.maxInput,
            system: options.system,
            maxOutput: options.maxOutput,
            silent: options.silent,
            filesReport: options.filesReport,
            slug: sessionId,
            mode,
            browserConfig,
            verbose: options.verbose,
            heartbeatIntervalMs: options.heartbeatIntervalMs,
            browserInlineFiles: options.browserInlineFiles,
            browserBundleFiles: options.browserBundleFiles,
            background: options.background,
            search: options.search,
            baseUrl: options.baseUrl,
            azure: options.azure,
        },
    };
    await ensureDir(modelsDir(sessionId));
    await fs.writeFile(metaPath(sessionId), JSON.stringify(metadata, null, 2), 'utf8');
    await Promise.all((modelList.length > 0 ? modelList : [metadata.model ?? DEFAULT_MODEL]).map(async (modelName) => {
        const jsonPath = modelJsonPath(sessionId, modelName);
        const logFilePath = modelLogPath(sessionId, modelName);
        const modelRecord = {
            model: modelName,
            status: 'pending',
            log: { path: path.relative(sessionDir(sessionId), logFilePath) },
        };
        await fs.writeFile(jsonPath, JSON.stringify(modelRecord, null, 2), 'utf8');
        await fs.writeFile(logFilePath, '', 'utf8');
    }));
    await fs.writeFile(logPath(sessionId), '', 'utf8');
    return metadata;
}
export async function readSessionMetadata(sessionId) {
    const modern = await readModernSessionMetadata(sessionId);
    if (modern) {
        return modern;
    }
    const legacy = await readLegacySessionMetadata(sessionId);
    if (legacy) {
        return legacy;
    }
    return null;
}
export async function updateSessionMetadata(sessionId, updates) {
    const existing = (await readModernSessionMetadata(sessionId)) ??
        (await readLegacySessionMetadata(sessionId)) ??
        { id: sessionId };
    const next = { ...existing, ...updates };
    await fs.writeFile(metaPath(sessionId), JSON.stringify(next, null, 2), 'utf8');
    return next;
}
async function readModernSessionMetadata(sessionId) {
    try {
        const raw = await fs.readFile(metaPath(sessionId), 'utf8');
        const parsed = JSON.parse(raw);
        if (!isSessionMetadataRecord(parsed)) {
            return null;
        }
        const enriched = await attachModelRuns(parsed, sessionId);
        return await markZombie(enriched, { persist: false });
    }
    catch {
        return null;
    }
}
async function readLegacySessionMetadata(sessionId) {
    try {
        const raw = await fs.readFile(legacySessionPath(sessionId), 'utf8');
        const parsed = JSON.parse(raw);
        const enriched = await attachModelRuns(parsed, sessionId);
        return await markZombie(enriched, { persist: false });
    }
    catch {
        return null;
    }
}
function isSessionMetadataRecord(value) {
    return Boolean(value && typeof value.id === 'string' && value.status);
}
async function attachModelRuns(meta, sessionId) {
    const runs = await listModelRunFiles(sessionId);
    if (runs.length === 0) {
        return meta;
    }
    return { ...meta, models: runs };
}
export function createSessionLogWriter(sessionId, model) {
    const targetPath = model ? modelLogPath(sessionId, model) : logPath(sessionId);
    if (model) {
        void ensureDir(modelsDir(sessionId));
    }
    const stream = createWriteStream(targetPath, { flags: 'a' });
    const logLine = (line = '') => {
        stream.write(`${line}\n`);
    };
    const writeChunk = (chunk) => {
        stream.write(chunk);
        return true;
    };
    return { stream, logLine, writeChunk, logPath: targetPath };
}
export async function listSessionsMetadata() {
    await ensureSessionStorage();
    const entries = await fs.readdir(SESSIONS_DIR).catch(() => []);
    const metas = [];
    for (const entry of entries) {
        let meta = await readSessionMetadata(entry);
        if (meta) {
            meta = await markZombie(meta, { persist: true }); // keep stored metadata consistent with zombie detection
            metas.push(meta);
        }
    }
    return metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function filterSessionsByRange(metas, { hours = 24, includeAll = false, limit = 100 }) {
    const maxLimit = Math.min(limit, MAX_STATUS_LIMIT);
    let filtered = metas;
    if (!includeAll) {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        filtered = metas.filter((meta) => new Date(meta.createdAt).getTime() >= cutoff);
    }
    const limited = filtered.slice(0, maxLimit);
    const truncated = filtered.length > maxLimit;
    return { entries: limited, truncated, total: filtered.length };
}
export async function readSessionLog(sessionId) {
    const runs = await listModelRunFiles(sessionId);
    if (runs.length === 0) {
        try {
            return await fs.readFile(logPath(sessionId), 'utf8');
        }
        catch {
            return '';
        }
    }
    const sections = [];
    let hasContent = false;
    const ordered = runs
        .slice()
        .sort((a, b) => (a.startedAt && b.startedAt ? a.startedAt.localeCompare(b.startedAt) : a.model.localeCompare(b.model)));
    for (const run of ordered) {
        const logFile = run.log?.path
            ? path.isAbsolute(run.log.path)
                ? run.log.path
                : path.join(sessionDir(sessionId), run.log.path)
            : modelLogPath(sessionId, run.model);
        let body = '';
        try {
            body = await fs.readFile(logFile, 'utf8');
        }
        catch {
            body = '';
        }
        if (body.length > 0) {
            hasContent = true;
        }
        sections.push(`=== ${run.model} ===\n${body}`.trimEnd());
    }
    if (!hasContent) {
        try {
            return await fs.readFile(logPath(sessionId), 'utf8');
        }
        catch {
            // ignore and return structured header-only log
        }
    }
    return sections.join('\n\n');
}
export async function readModelLog(sessionId, model) {
    try {
        return await fs.readFile(modelLogPath(sessionId, model), 'utf8');
    }
    catch {
        return '';
    }
}
export async function readSessionRequest(sessionId) {
    const modern = await readModernSessionMetadata(sessionId);
    if (modern?.options) {
        return modern.options;
    }
    try {
        const raw = await fs.readFile(requestPath(sessionId), 'utf8');
        const parsed = JSON.parse(raw);
        if (isSessionMetadataRecord(parsed)) {
            return parsed.options ?? null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export async function deleteSessionsOlderThan({ hours = 24, includeAll = false, } = {}) {
    await ensureSessionStorage();
    const entries = await fs.readdir(SESSIONS_DIR).catch(() => []);
    if (!entries.length) {
        return { deleted: 0, remaining: 0 };
    }
    const cutoff = includeAll ? Number.NEGATIVE_INFINITY : Date.now() - hours * 60 * 60 * 1000;
    let deleted = 0;
    for (const entry of entries) {
        const dir = sessionDir(entry);
        let createdMs;
        const meta = await readSessionMetadata(entry);
        if (meta?.createdAt) {
            const parsed = Date.parse(meta.createdAt);
            if (!Number.isNaN(parsed)) {
                createdMs = parsed;
            }
        }
        if (createdMs == null) {
            try {
                const stats = await fs.stat(dir);
                createdMs = stats.birthtimeMs || stats.mtimeMs;
            }
            catch {
                continue;
            }
        }
        if (includeAll || (createdMs != null && createdMs < cutoff)) {
            await fs.rm(dir, { recursive: true, force: true });
            deleted += 1;
        }
    }
    const remaining = Math.max(entries.length - deleted, 0);
    return { deleted, remaining };
}
export async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export { ORACLE_HOME, SESSIONS_DIR, MAX_STATUS_LIMIT };
export { ZOMBIE_MAX_AGE_MS };
export async function getSessionPaths(sessionId) {
    const dir = sessionDir(sessionId);
    const metadata = metaPath(sessionId);
    const log = logPath(sessionId);
    const request = requestPath(sessionId);
    const required = [metadata, log];
    const missing = [];
    for (const file of required) {
        if (!(await fileExists(file))) {
            missing.push(path.basename(file));
        }
    }
    if (missing.length > 0) {
        throw new Error(`Session "${sessionId}" is missing: ${missing.join(', ')}`);
    }
    return { dir, metadata, log, request };
}
async function markZombie(meta, { persist }) {
    if (!isZombie(meta)) {
        return meta;
    }
    const updated = {
        ...meta,
        status: 'error',
        errorMessage: 'Session marked as zombie (>60m stale)',
        completedAt: new Date().toISOString(),
    };
    if (persist) {
        await fs.writeFile(metaPath(meta.id), JSON.stringify(updated, null, 2), 'utf8');
    }
    return updated;
}
function isZombie(meta) {
    if (meta.status !== 'running') {
        return false;
    }
    const reference = meta.startedAt ?? meta.createdAt;
    if (!reference) {
        return false;
    }
    const startedMs = Date.parse(reference);
    if (Number.isNaN(startedMs)) {
        return false;
    }
    return Date.now() - startedMs > ZOMBIE_MAX_AGE_MS;
}
