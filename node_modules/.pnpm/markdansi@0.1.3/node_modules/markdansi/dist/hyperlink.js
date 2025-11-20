import supportsHyperlinks from "supports-hyperlinks";
/**
 * Detect OSC-8 hyperlink support for a given stream (defaults to stdout).
 */
export function hyperlinkSupported(stream = process.stdout) {
    const helper = supportsHyperlinks;
    try {
        if (typeof supportsHyperlinks === "function") {
            return Boolean(supportsHyperlinks(stream));
        }
        if (helper.stdout)
            return Boolean(helper.stdout(stream));
        if (helper.default && typeof helper.default === "function")
            return Boolean(helper.default(stream));
    }
    catch {
        return false;
    }
    return false;
}
/**
 * Build an OSC-8 hyperlink sequence.
 */
export function osc8(url, text) {
    return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
}
