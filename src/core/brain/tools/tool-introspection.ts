/**
 * Tool Introspection API for Ptah
 * Provides interfaces and functions to introspect available tools and their metadata
 */

import { UnifiedToolManager } from './unified-tool-manager.js';

export interface ToolParameter {
  type: string;
  description?: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

export interface ToolMetadata {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  source: 'internal' | 'mcp';
  category?: string;
  version?: string;
}

export interface ToolIntrospectionResult {
  tools: ToolMetadata[];
  totalCount: number;
  timestamp: Date;
  source: 'unified-manager' | 'mcp-handler' | 'combined' | 'error' | 'legacy';
}

export interface ToolIntrospectionOptions {
  source?: 'internal' | 'mcp' | 'all';
  category?: string;
  includeParameters?: boolean;
  limit?: number;
}

/**
 * Tool Introspection API Class
 * Provides methods to introspect available tools and their metadata
 */
export class ToolIntrospectionAPI {
  private unifiedToolManager: UnifiedToolManager;

  constructor(unifiedToolManager: UnifiedToolManager) {
    this.unifiedToolManager = unifiedToolManager;
  }

  /**
   * Get introspection data for all available tools
   * @param options Configuration options for the introspection
   * @returns Promise resolving to tool introspection result
   */
  async getToolIntrospection(options: ToolIntrospectionOptions = {}): Promise<ToolIntrospectionResult> {
    const {
      source = 'all',
      category,
      includeParameters = true,
      limit
    } = options;

    try {
      const allTools = await this.unifiedToolManager.getAllTools();
      let tools: ToolMetadata[] = [];

      for (const [name, tool] of Object.entries(allTools)) {
        // Filter by source if specified
        if (source !== 'all' && tool.source !== source) {
          continue;
        }

        // Filter by category if specified (categories not yet implemented in tool metadata)
        if (category && !this.matchesCategory(tool, category)) {
          continue;
        }

        const toolMetadata: ToolMetadata = {
          name,
          description: tool.description,
          parameters: includeParameters ? this.convertParametersToSchema(tool.parameters) : {},
          source: tool.source,
          category: this.inferCategory(name, tool.description),
          version: '1.0.0' // Default version
        };

        tools.push(toolMetadata);
      }

      // Apply limit if specified
      if (limit && tools.length > limit) {
        tools = tools.slice(0, limit);
      }

      return {
        tools,
        totalCount: tools.length,
        timestamp: new Date(),
        source: source === 'all' ? 'combined' : (source === 'internal' ? 'unified-manager' : 'mcp-handler')
      };
    } catch (error) {
      console.error('Error getting tool introspection:', error);
      return {
        tools: [],
        totalCount: 0,
        timestamp: new Date(),
        source: 'error'
      };
    }
  }

  /**
   * Get tools by category
   */
  async getToolsByCategory(category: string): Promise<ToolIntrospectionResult> {
    return this.getToolIntrospection({ category });
  }

  /**
   * Get tools by source
   */
  async getToolsBySource(source: 'internal' | 'mcp'): Promise<ToolIntrospectionResult> {
    return this.getToolIntrospection({ source });
  }

  /**
   * Get agent accessible tools
   */
  async getAgentAccessibleTools(): Promise<ToolIntrospectionResult> {
    // This depends on the mode of UnifiedToolManager
    // For now, return all tools (mode filtering is handled in UnifiedToolManager)
    return this.getToolIntrospection();
  }

  /**
   * Search tools by query
   */
  async searchTools(query: string): Promise<ToolIntrospectionResult> {
    const result = await this.getToolIntrospection();
    const filteredTools = result.tools.filter(tool =>
      tool.name.toLowerCase().includes(query.toLowerCase()) ||
      tool.description.toLowerCase().includes(query.toLowerCase()) ||
      (tool.category && tool.category.toLowerCase().includes(query.toLowerCase()))
    );

    return {
      ...result,
      tools: filteredTools,
      totalCount: filteredTools.length
    };
  }

  /**
   * Get categories summary
   */
  async getCategoriesSummary(): Promise<{ [category: string]: number }> {
    const result = await this.getToolIntrospection();
    const categories: { [category: string]: number } = {};

    for (const tool of result.tools) {
      const category = tool.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    }

    return categories;
  }

  /**
   * Convert tool parameters to JSON schema format
   */
  private convertParametersToSchema(parameters: any): Record<string, ToolParameter> {
    if (!parameters || typeof parameters !== 'object') {
      return {};
    }

    const schema: Record<string, ToolParameter> = {};

    if (parameters.properties) {
      for (const [key, value] of Object.entries(parameters.properties)) {
        schema[key] = this.convertParameter(value);
      }
    }

    return schema;
  }

  /**
   * Convert single parameter to ToolParameter format
   */
  private convertParameter(param: any): ToolParameter {
    return {
      type: param.type || 'string',
      description: param.description,
      required: param.required,
      default: param.default,
      enum: param.enum,
      items: param.items ? this.convertParameter(param.items) : undefined,
      properties: param.properties ? this.convertParametersToSchema({ properties: param.properties }) : undefined
    };
  }

  /**
   * Check if tool matches category
   */
  private matchesCategory(tool: any, category: string): boolean {
    const inferredCategory = this.inferCategory(tool.name || '', tool.description || '');
    return inferredCategory.toLowerCase().includes(category.toLowerCase());
  }

  /**
   * Infer category from tool name and description
   */
  private inferCategory(name: string, description: string): string {
    const text = `${name} ${description}`.toLowerCase();

    if (text.includes('logfire')) {
      return 'logging';
    }
    if (text.includes('search') || text.includes('find') || text.includes('query')) {
      return 'search';
    }
    if (text.includes('memory') || text.includes('store') || text.includes('retrieve')) {
      return 'memory';
    }
    if (text.includes('file') || text.includes('read') || text.includes('write')) {
      return 'file';
    }
    if (text.includes('bash') || text.includes('command') || text.includes('execute')) {
      return 'system';
    }
    if (text.includes('git') || text.includes('github')) {
      return 'version-control';
    }
    if (text.includes('task') || text.includes('project')) {
      return 'project-management';
    }
    if (text.includes('mcp') || text.includes('tool')) {
      return 'tool';
    }
    if (text.includes('knowledge') || text.includes('ptah')) {
      return 'knowledge';
    }

    return 'general';
  }
}

/**
 * Legacy function interface for backward compatibility
 * @deprecated Use ToolIntrospectionAPI class instead
 */
export async function getToolIntrospection(
  options: ToolIntrospectionOptions = {}
): Promise<ToolIntrospectionResult> {
  // This would need a UnifiedToolManager instance
  // For now, return empty result
  return {
    tools: [],
    totalCount: 0,
    timestamp: new Date(),
    source: 'legacy'
  };
}

/**
 * Get metadata for a specific tool by name
 * @param toolName Name of the tool to introspect
 * @returns Promise resolving to tool metadata or null if not found
 */
export async function getToolMetadata(toolName: string): Promise<ToolMetadata | null> {
  // Implementation will be added in next subtask
  return null;
}

/**
 * Validate tool parameters against their schema
 * @param toolName Name of the tool
 * @param parameters Parameters to validate
 * @returns Promise resolving to validation result
 */
export async function validateToolParameters(
  toolName: string,
  parameters: Record<string, any>
): Promise<{ valid: boolean; errors?: string[] }> {
  // Implementation will be added in next subtask
  return { valid: true };
}