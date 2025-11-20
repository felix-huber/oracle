import { PRO_MODELS } from '../oracle.js';
export function defaultWaitPreference(model, engine) {
    // Pro-class API runs can take a long time; prefer non-blocking unless explicitly overridden.
    if (engine === 'api' && PRO_MODELS.has(model)) {
        return false;
    }
    return true; // browser or non-pro models are fast enough to block by default
}
/**
 * Determine which engine to use based on CLI flags and the environment.
 *
 * Precedence:
 * 1) Legacy --browser flag forces browser.
 * 2) Explicit --engine value.
 * 3) OPENAI_API_KEY decides: api when set, otherwise browser.
 */
export function resolveEngine({ engine, browserFlag, env, }) {
    if (browserFlag) {
        return 'browser';
    }
    if (engine) {
        return engine;
    }
    return env.OPENAI_API_KEY ? 'api' : 'browser';
}
