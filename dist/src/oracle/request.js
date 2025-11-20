import fs from 'node:fs/promises';
import { DEFAULT_SYSTEM_PROMPT } from './config.js';
import { createFileSections, readFiles } from './files.js';
import { createFsAdapter } from './fsAdapter.js';
export function buildPrompt(basePrompt, files, cwd = process.cwd()) {
    if (!files.length) {
        return basePrompt;
    }
    const sections = createFileSections(files, cwd);
    const sectionText = sections.map((section) => section.sectionText).join('\n\n');
    return `${basePrompt.trim()}\n\n${sectionText}`;
}
export function buildRequestBody({ modelConfig, systemPrompt, userPrompt, searchEnabled, maxOutputTokens, background, storeResponse, }) {
    return {
        model: modelConfig.model,
        instructions: systemPrompt,
        input: [
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: userPrompt,
                    },
                ],
            },
        ],
        tools: searchEnabled ? [{ type: 'web_search_preview' }] : undefined,
        reasoning: modelConfig.reasoning || undefined,
        max_output_tokens: maxOutputTokens,
        background: background ? true : undefined,
        store: storeResponse ? true : undefined,
    };
}
export async function renderPromptMarkdown(options, deps = {}) {
    const cwd = deps.cwd ?? process.cwd();
    const fsModule = deps.fs ?? createFsAdapter(fs);
    const files = await readFiles(options.file ?? [], { cwd, fsModule });
    const sections = createFileSections(files, cwd);
    const systemPrompt = options.system?.trim() || DEFAULT_SYSTEM_PROMPT;
    const userPrompt = (options.prompt ?? '').trim();
    const lines = ['[SYSTEM]', systemPrompt, ''];
    lines.push('[USER]', userPrompt, '');
    sections.forEach((section) => {
        lines.push(`[FILE: ${section.displayPath}]`, section.content.trimEnd(), '');
    });
    return lines.join('\n');
}
