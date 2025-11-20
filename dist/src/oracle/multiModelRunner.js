import fs from 'node:fs/promises';
import path from 'node:path';
import { runOracle, OracleResponseError, OracleTransportError, extractResponseMetadata, asOracleUserError, extractTextOutput, } from '../oracle.js';
import { sessionStore } from '../sessionStore.js';
const defaultDeps = {
    store: sessionStore,
    runOracleImpl: runOracle,
    now: () => Date.now(),
};
export async function runMultiModelApiSession(params, deps = defaultDeps) {
    const { sessionMeta, runOptions, models, cwd, version } = params;
    const store = deps.store ?? sessionStore;
    const runOracleImpl = deps.runOracleImpl ?? runOracle;
    const now = deps.now ?? (() => Date.now());
    const startMark = now();
    const executions = models.map((model) => startModelExecution({
        sessionMeta,
        runOptions,
        model,
        cwd,
        version,
        store,
        runOracleImpl,
    }));
    const settled = await Promise.allSettled(executions.map((exec) => exec.promise));
    const fulfilled = [];
    const rejected = [];
    settled.forEach((result, index) => {
        const exec = executions[index];
        if (result.status === 'fulfilled') {
            fulfilled.push(result.value);
        }
        else {
            rejected.push({ model: exec.model, reason: result.reason });
        }
    });
    return {
        fulfilled,
        rejected,
        elapsedMs: now() - startMark,
    };
}
function startModelExecution({ sessionMeta, runOptions, model, cwd, version, store, runOracleImpl, }) {
    const logWriter = store.createLogWriter(sessionMeta.id, model);
    const perModelOptions = {
        ...runOptions,
        model,
        models: undefined,
        sessionId: `${sessionMeta.id}:${model}`,
    };
    const perModelLog = (message) => {
        logWriter.logLine(message ?? '');
    };
    const perModelWrite = (chunk) => {
        logWriter.writeChunk(chunk);
        return true;
    };
    const promise = (async () => {
        await store.updateModelRun(sessionMeta.id, model, {
            status: 'running',
            queuedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
        });
        perModelLog(`🧿 oracle (${version}) summons ${model}`);
        const result = await runOracleImpl(perModelOptions, {
            cwd,
            log: perModelLog,
            write: perModelWrite,
        });
        if (result.mode !== 'live') {
            throw new Error('Unexpected preview result while running a session.');
        }
        const answerText = extractTextOutput(result.response);
        await store.updateModelRun(sessionMeta.id, model, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            usage: result.usage,
            response: extractResponseMetadata(result.response),
            transport: undefined,
            error: undefined,
            log: await describeLog(sessionMeta.id, logWriter.logPath, store),
        });
        return {
            model,
            usage: result.usage,
            answerText,
            logPath: logWriter.logPath,
        };
    })()
        .catch(async (error) => {
        const userError = asOracleUserError(error);
        const responseMetadata = error instanceof OracleResponseError ? error.metadata : undefined;
        const transportMetadata = error instanceof OracleTransportError ? { reason: error.reason } : undefined;
        await store.updateModelRun(sessionMeta.id, model, {
            status: 'error',
            completedAt: new Date().toISOString(),
            response: responseMetadata,
            transport: transportMetadata,
            error: userError
                ? {
                    category: userError.category,
                    message: userError.message,
                    details: userError.details,
                }
                : undefined,
            log: await describeLog(sessionMeta.id, logWriter.logPath, store),
        });
        throw error;
    })
        .finally(() => {
        logWriter.stream.end();
    });
    return { model, promise };
}
async function describeLog(sessionId, logFilePath, store) {
    const { dir } = await store.getPaths(sessionId);
    const relative = path.relative(dir, logFilePath);
    try {
        const stats = await fsStat(logFilePath);
        return { path: relative, bytes: stats.size };
    }
    catch {
        return { path: relative };
    }
}
async function fsStat(target) {
    const stats = await fs.stat(target);
    return { size: stats.size };
}
