export type LogicalTool = 'web_search';

export interface ToolSupport {
  search: boolean;
}

export function toolSupportForModel(model: string): ToolSupport {
  if (model.startsWith('claude')) {
    return { search: false };
  }
  return { search: true };
}
