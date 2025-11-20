export function formatUSD(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    // Display with 4 decimal places, rounding to $0.0001 minimum granularity.
    return `$${value.toFixed(4)}`;
}
export function formatNumber(value, { estimated = false } = {}) {
    if (value == null) {
        return 'n/a';
    }
    const suffix = estimated ? ' (est.)' : '';
    return `${value.toLocaleString()}${suffix}`;
}
export function formatElapsed(ms) {
    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.round(totalSeconds - minutes * 60);
    let adjustedMinutes = minutes;
    if (seconds === 60) {
        adjustedMinutes += 1;
        seconds = 0;
    }
    return `${adjustedMinutes}m ${seconds}s`;
}
