import type { RenderOptions } from "./types.js";
/**
 * Render Markdown input to an ANSI string.
 */
export declare function render(markdown: string, userOptions?: RenderOptions): string;
/**
 * Create a reusable renderer with fixed options.
 */
export declare function createRenderer(options?: RenderOptions): (md: string) => string;
