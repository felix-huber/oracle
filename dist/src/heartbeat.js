export function startHeartbeat(config) {
    const { intervalMs, log, isActive, makeMessage } = config;
    if (!intervalMs || intervalMs <= 0) {
        return () => { };
    }
    let stopped = false;
    let pending = false;
    const start = Date.now();
    const timer = setInterval(async () => {
        // biome-ignore lint/nursery/noUnnecessaryConditions: stop flag flips asynchronously
        if (stopped || pending) {
            return;
        }
        if (!isActive()) {
            stop();
            return;
        }
        pending = true;
        try {
            const elapsed = Date.now() - start;
            const message = await makeMessage(elapsed);
            if (message && !stopped) {
                log(message);
            }
        }
        catch {
            // ignore heartbeat errors
        }
        finally {
            pending = false;
        }
    }, intervalMs);
    timer.unref?.();
    const stop = () => {
        // biome-ignore lint/nursery/noUnnecessaryConditions: multiple callers may race to stop
        if (stopped) {
            return;
        }
        stopped = true;
        clearInterval(timer);
    };
    return stop;
}
