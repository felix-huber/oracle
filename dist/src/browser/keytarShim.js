/**
 * Runtime shim to broaden Keychain/DPAPI lookups without vendoring chrome-cookies-secure.
 * It tries a list of alternative service/account labels after the original call fails.
 * Configure via ORACLE_KEYCHAIN_LABELS='[{"service":"Microsoft Edge Safe Storage","account":"Microsoft Edge"},...]'
 */
import keytar from 'keytar';
const defaultLabels = [
    { service: 'Chrome Safe Storage', account: 'Chrome' },
    { service: 'Chromium Safe Storage', account: 'Chromium' },
    { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
    { service: 'Brave Safe Storage', account: 'Brave' },
    { service: 'Vivaldi Safe Storage', account: 'Vivaldi' },
];
function loadEnvLabels() {
    const raw = process.env.ORACLE_KEYCHAIN_LABELS;
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .map((entry) => (entry && typeof entry === 'object' ? entry : null))
                .filter((entry) => Boolean(entry?.service && entry?.account));
        }
    }
    catch {
        // ignore invalid env payload
    }
    return [];
}
const fallbackLabels = [...loadEnvLabels(), ...defaultLabels];
const originalGetPassword = keytar.getPassword.bind(keytar);
keytar.getPassword = async (service, account) => {
    const primary = await originalGetPassword(service, account);
    if (primary) {
        return primary;
    }
    for (const label of fallbackLabels) {
        if (label.service === service && label.account === account) {
            continue; // already tried
        }
        const value = await originalGetPassword(label.service, label.account);
        if (value) {
            return value;
        }
    }
    return null;
};
