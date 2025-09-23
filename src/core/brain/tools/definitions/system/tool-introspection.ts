/**
 * Tool Introspection Tool for Ptah
 *
 * Provides Ptah with the ability to discover and inspect available tools dynamically.
 * This tool allows Ptah to understand what tools are available without relying on template variables.
 */

import {
	createInternalToolName,
	type InternalTool,
	type InternalToolHandler,
} from '../../types.js';
import { ToolIntrospectionAPI } from '../../tool-introspection.js';
import { logger } from '../../../../logger/index.js';

/**
 * Tool introspection handler implementation
 */
const toolIntrospectionHandler: InternalToolHandler = async (args, context) => {
	try {
		const { source, category, search, includeParameters, limit } = args;

		// Get UnifiedToolManager from context
		const unifiedToolManager = context?.unifiedToolManager;
		if (!unifiedToolManager) {
			logger.error('Tool Introspection: UnifiedToolManager not available in context');
			return {
				success: false,
				error: 'Tool management system not available',
			};
		}

		// Initialize Tool Introspection API
		const api = new ToolIntrospectionAPI(unifiedToolManager);

		let result;

		if (search) {
			// Search for tools by query
			result = await api.searchTools(search);
		} else if (category) {
			// Get tools by category
			result = await api.getToolsByCategory(category);
		} else if (source) {
			// Get tools by source
			result = await api.getToolsBySource(source as 'internal' | 'mcp');
		} else {
			// Get all tools
			result = await api.getToolIntrospection({
				includeParameters: includeParameters !== false,
				limit,
			});
		}

		// Format the response for Ptah
		let output = `Tool Discovery Result (${result.totalCount} tools found):\n\n`;

		if (result.tools.length === 0) {
			output += 'No tools found matching the criteria.\n';
		} else {
			// Group by category for better organization
			const categories = result.tools.reduce((acc, tool) => {
				const cat = tool.category || 'general';
				if (!acc[cat]) acc[cat] = [];
				acc[cat].push(tool);
				return acc;
			}, {} as Record<string, typeof result.tools>);

			for (const [categoryName, tools] of Object.entries(categories)) {
				output += `## ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Tools:\n`;

				for (const tool of tools) {
					output += `- **${tool.name}** (${tool.source}): ${tool.description}\n`;

					if (includeParameters !== false && tool.parameters && Object.keys(tool.parameters).length > 0) {
						output += `  Parameters: ${Object.keys(tool.parameters).join(', ')}\n`;
					}
				}
				output += '\n';
			}
		}

		// Add summary information
		const categorySummary = await api.getCategoriesSummary();
		output += `Categories Summary: ${Object.entries(categorySummary)
			.map(([cat, count]) => `${cat}(${count})`)
			.join(', ')}\n`;

		return {
			success: true,
			result: output,
			metadata: {
				totalTools: result.totalCount,
				timestamp: result.timestamp,
				source: result.source,
				categories: categorySummary,
			},
		};
	} catch (error) {
		logger.error('Tool Introspection failed:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown tool introspection error',
		};
	}
};

/**
 * Tool introspection tool definition
 */
export const toolIntrospectionTool: InternalTool = {
	name: createInternalToolName('tool_introspection'),
	displayName: 'Tool Introspection',
	description: 'Discover and inspect available tools in the system. Allows querying tools by source, category, or search terms.',
	category: 'system',
	handler: toolIntrospectionHandler,
	internal: true,
	parameters: {
		type: 'object',
		properties: {
			source: {
				type: 'string',
				enum: ['internal', 'mcp'],
				description: 'Filter tools by source (internal or MCP)',
			},
			category: {
				type: 'string',
				description: 'Filter tools by category (e.g., memory, search, file, system)',
			},
			search: {
				type: 'string',
				description: 'Search for tools by name or description',
			},
			includeParameters: {
				type: 'boolean',
				default: true,
				description: 'Whether to include parameter information in the output',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of tools to return',
				minimum: 1,
				maximum: 100,
			},
		},
		additionalProperties: false,
	},
	agentAccessible: true,
	requiresAuthentication: false,
	rateLimitConfig: {
		maxCalls: 50,
		windowMs: 60000, // 1 minute
	},
};