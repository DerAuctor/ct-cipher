/**
 * Gemini Schema Converter
 *
 * Converts JSON Schema Draft-07 parameters to Gemini API compatible format.
 * Removes unsupported fields and normalizes schema structure for Gemini Function Calling.
 *
 * Addresses the specific error:
 * - Unknown name "$schema", "exclusiveMinimum", "const", "propertyNames"
 * - Invalid array type definitions
 */

import { logger } from '../../../logger/index.js';

/**
 * Configuration for schema conversion
 */
export interface GeminiSchemaConverterConfig {
	/**
	 * Whether to log conversion warnings
	 * @default true
	 */
	logWarnings?: boolean;

	/**
	 * Whether to preserve unknown properties
	 * @default false
	 */
	preserveUnknownProps?: boolean;

	/**
	 * Maximum recursion depth for nested objects
	 * @default 10
	 */
	maxDepth?: number;
}

/**
 * Utility to convert JSON Schema Draft-07 to Gemini API compatible format
 */
export class GeminiSchemaConverter {
	private config: Required<GeminiSchemaConverterConfig>;

	constructor(config: GeminiSchemaConverterConfig = {}) {
		this.config = {
			logWarnings: true,
			preserveUnknownProps: false,
			maxDepth: 10,
			...config,
		};
	}

	/**
	 * Convert a JSON Schema Draft-07 parameter object to Gemini API format
	 */
	convertSchema(schema: any): any {
		if (!schema || typeof schema !== 'object') {
			return schema;
		}

		return this.processSchemaObject(schema, 0);
	}

	/**
	 * Process a schema object recursively
	 */
	private processSchemaObject(obj: any, depth: number): any {
		if (depth > this.config.maxDepth) {
			this.logWarning(`Maximum recursion depth ${this.config.maxDepth} reached, truncating schema`);
			return { type: 'object' };
		}

		if (Array.isArray(obj)) {
			return obj.map(item => this.processSchemaObject(item, depth + 1));
		}

		if (typeof obj !== 'object' || obj === null) {
			return obj;
		}

		const result: any = {};

		for (const [key, value] of Object.entries(obj)) {
			if (this.shouldRemoveProperty(key)) {
				this.logWarning(`Removing unsupported property: ${key}`);
				continue;
			}

			if (this.shouldTransformProperty(key)) {
				const transformed = this.transformProperty(key, value, depth);
				if (transformed) {
					Object.assign(result, transformed);
				}
				continue;
			}

			// Recursively process nested objects
			if (typeof value === 'object' && value !== null) {
				result[key] = this.processSchemaObject(value, depth + 1);
			} else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Check if a property should be removed completely
	 */
	private shouldRemoveProperty(key: string): boolean {
		const unsupportedProps = [
			'$schema',
			'$id',
			'$ref',
			'$comment',
			'exclusiveMinimum',
			'exclusiveMaximum',
			'const',
			'propertyNames',
			'additionalItems',
			'contains',
			'patternProperties',
			'dependencies',
			'if',
			'then',
			'else',
			'allOf',
			'anyOf',
			'oneOf',
			'not',
		];

		return unsupportedProps.includes(key);
	}

	/**
	 * Check if a property needs special transformation
	 */
	private shouldTransformProperty(key: string): boolean {
		const transformableProps = [
			'type',
			'items',
			'additionalProperties',
		];

		return transformableProps.includes(key);
	}

	/**
	 * Transform specific properties that need special handling
	 */
	private transformProperty(key: string, value: any, depth: number): any {
		switch (key) {
			case 'type':
				return this.transformTypeProperty(value);

			case 'items':
				return this.transformItemsProperty(value, depth);

			case 'additionalProperties':
				return this.transformAdditionalPropertiesProperty(value, depth);

			default:
				return { [key]: value };
		}
	}

	/**
	 * Transform type property - handle array types
	 */
	private transformTypeProperty(value: any): any {
		if (Array.isArray(value)) {
			// Gemini doesn't support array of types like ["string", "null"]
			// Pick the first non-null type or default to string
			const nonNullTypes = value.filter((t: any) => t !== 'null');
			const selectedType = nonNullTypes.length > 0 ? nonNullTypes[0] : 'string';

			this.logWarning(`Array type ${JSON.stringify(value)} simplified to: ${selectedType}`);
			return { type: selectedType };
		}

		return { type: value };
	}

	/**
	 * Transform items property for arrays
	 */
	private transformItemsProperty(value: any, depth: number): any {
		if (Array.isArray(value)) {
			// Multiple item schemas not supported, use first one
			const firstItem = value[0];
			this.logWarning(`Array of item schemas simplified to first item`);
			return { items: this.processSchemaObject(firstItem, depth + 1) };
		}

		return { items: this.processSchemaObject(value, depth + 1) };
	}

	/**
	 * Transform additionalProperties - simplify complex schemas
	 */
	private transformAdditionalPropertiesProperty(value: any, depth: number): any {
		if (typeof value === 'boolean') {
			return { additionalProperties: value };
		}

		// If it's an object schema, process it
		if (typeof value === 'object' && value !== null) {
			return { additionalProperties: this.processSchemaObject(value, depth + 1) };
		}

		return { additionalProperties: true };
	}

	/**
	 * Log warning if warnings are enabled
	 */
	private logWarning(message: string): void {
		if (this.config.logWarnings) {
			logger.warn(`GeminiSchemaConverter: ${message}`);
		}
	}

	/**
	 * Convert tools array from UnifiedToolManager format to Gemini format
	 */
	convertToolsArray(tools: any[]): any[] {
		return tools.map(tool => this.convertSingleTool(tool)).filter(tool => tool !== null);
	}

	/**
	 * Convert a single tool to Gemini format
	 */
	convertSingleTool(tool: any): any {
		// Debug logging to find broken tools
		if (this.options?.logWarnings) {
			console.debug('Converting tool:', JSON.stringify(tool, null, 2));
		}

		if (tool.function) {
			// OpenAI-style tool format
			const name = tool.function.name;
			if (!name) {
				console.error('BROKEN TOOL - Missing function.name:', JSON.stringify(tool, null, 2));
				return null; // Skip broken tools
			}
			return {
				functionDeclarations: [{
					name: name,
					description: tool.function.description || 'No description',
					parameters: this.convertSchema(tool.function.parameters),
				}]
			};
		} else {
			// Direct tool format
			const name = tool.name;
			if (!name) {
				console.error('BROKEN TOOL - Missing name:', JSON.stringify(tool, null, 2));
				return null; // Skip broken tools
			}
			return {
				functionDeclarations: [{
					name: name,
					description: tool.description || 'No description',
					parameters: this.convertSchema(tool.parameters),
				}]
			};
		}
	}

	/**
	 * Static helper for quick conversions
	 */
	static convert(schema: any, config?: GeminiSchemaConverterConfig): any {
		const converter = new GeminiSchemaConverter(config);
		return converter.convertSchema(schema);
	}

	/**
	 * Static helper for converting tools array
	 */
	static convertTools(tools: any[], config?: GeminiSchemaConverterConfig): any[] {
		const converter = new GeminiSchemaConverter(config);
		return converter.convertToolsArray(tools);
	}
}