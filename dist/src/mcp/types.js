import { z } from 'zod';
export const consultInputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required.'),
    files: z.array(z.string()).default([]),
    model: z.string().optional(),
    models: z.array(z.string()).optional(),
    engine: z.enum(['api', 'browser']).optional(),
    browserModelLabel: z.string().optional(),
    search: z.boolean().optional(),
    slug: z.string().optional(),
});
export const sessionsInputSchema = z.object({
    id: z.string().optional(),
    hours: z.number().optional(),
    limit: z.number().optional(),
    includeAll: z.boolean().optional(),
    detail: z.boolean().optional(),
});
