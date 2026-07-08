export type ToolId =
  | 'financial-statement'
  | 'cash-flow-statement'
  | 'project-report'
  | 'project-estimate'
  | 'cma-data'
  | 'dpr'

export interface ToolDefinition {
  id: ToolId
  name: string
  shortName: string
  description: string
  available: boolean
  supportsConsolidated: boolean
  accent: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'slate'
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'financial-statement',
    name: 'Financial Statement',
    shortName: 'FS',
    description: 'Notes, Balance Sheet, P&L, depreciation, loans, GST reco, and finalization.',
    available: true,
    supportsConsolidated: true,
    accent: 'emerald',
  },
  {
    id: 'cash-flow-statement',
    name: 'Cash Flow Statement',
    shortName: 'CFS',
    description: 'Operating, investing, and financing cash flows by financial year.',
    available: false,
    supportsConsolidated: false,
    accent: 'sky',
  },
  {
    id: 'project-report',
    name: 'Project Report',
    shortName: 'PR',
    description: 'Structured project reporting for client submissions.',
    available: false,
    supportsConsolidated: false,
    accent: 'violet',
  },
  {
    id: 'project-estimate',
    name: 'Project Estimate',
    shortName: 'PE',
    description: 'Cost and revenue estimates for new or ongoing projects.',
    available: false,
    supportsConsolidated: false,
    accent: 'amber',
  },
  {
    id: 'cma-data',
    name: 'CMA Data',
    shortName: 'CMA',
    description: 'Credit monitoring arrangement data for banking submissions.',
    available: false,
    supportsConsolidated: false,
    accent: 'rose',
  },
  {
    id: 'dpr',
    name: 'DPR',
    shortName: 'DPR',
    description: 'Detailed project report preparation and review.',
    available: false,
    supportsConsolidated: false,
    accent: 'slate',
  },
]

const toolMap = new Map<ToolId, ToolDefinition>(TOOLS.map((tool) => [tool.id, tool]))

export function getToolById(toolId: string): ToolDefinition | undefined {
  return toolMap.get(toolId as ToolId)
}

export function isToolId(value: string): value is ToolId {
  return toolMap.has(value as ToolId)
}

export function getAvailableTools() {
  return TOOLS.filter((tool) => tool.available)
}
