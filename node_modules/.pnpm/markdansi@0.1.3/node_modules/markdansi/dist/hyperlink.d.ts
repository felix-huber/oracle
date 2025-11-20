import type { WriteStream } from "node:tty";
/**
 * Detect OSC-8 hyperlink support for a given stream (defaults to stdout).
 */
export declare function hyperlinkSupported(stream?: WriteStream): boolean;
/**
 * Build an OSC-8 hyperlink sequence.
 */
export declare function osc8(url: string, text: string): string;
