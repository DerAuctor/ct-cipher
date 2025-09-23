/**
 * Unit tests for GeminiSchemaConverter
 *
 * Tests schema conversion from JSON Schema Draft-07 to Gemini API format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiSchemaConverter } from '../gemini-schema-converter.js';

describe('GeminiSchemaConverter', () => {
	let converter: GeminiSchemaConverter;

	beforeEach(() => {
		converter = new GeminiSchemaConverter({
			logWarnings: false, // Disable warnings for tests
		});
	});

	describe('convertSchema', () => {
		it('should remove unsupported $schema property', () => {
			const input = {
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'object',
				properties: {
					name: { type: 'string' },
				},
			};

			const result = converter.convertSchema(input);

			expect(result).not.toHaveProperty('$schema');
			expect(result.type).toBe('object');
			expect(result.properties.name.type).toBe('string');
		});

		it('should remove exclusiveMinimum and exclusiveMaximum', () => {
			const input = {
				type: 'number',
				minimum: 0,
				maximum: 100,
				exclusiveMinimum: true,
				exclusiveMaximum: true,
			};

			const result = converter.convertSchema(input);

			expect(result).not.toHaveProperty('exclusiveMinimum');
			expect(result).not.toHaveProperty('exclusiveMaximum');
			expect(result.minimum).toBe(0);
			expect(result.maximum).toBe(100);
		});

		it('should remove const property', () => {
			const input = {
				type: 'string',
				const: 'fixed-value',
			};

			const result = converter.convertSchema(input);

			expect(result).not.toHaveProperty('const');
			expect(result.type).toBe('string');
		});

		it('should remove propertyNames property', () => {
			const input = {
				type: 'object',
				propertyNames: {
					pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
				},
				additionalProperties: { type: 'string' },
			};

			const result = converter.convertSchema(input);

			expect(result).not.toHaveProperty('propertyNames');
			expect(result.type).toBe('object');
			expect(result.additionalProperties).toBeDefined();
		});

		it('should convert array type to string type', () => {
			const input = {
				type: ['string', 'null'],
			};

			const result = converter.convertSchema(input);

			expect(result.type).toBe('string');
		});

		it('should handle nested objects recursively', () => {
			const input = {
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'object',
				properties: {
					user: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							age: {
								type: 'number',
								exclusiveMinimum: 0,
							},
						},
						const: 'should-be-removed',
					},
				},
			};

			const result = converter.convertSchema(input);

			expect(result).not.toHaveProperty('$schema');
			expect(result.properties.user).not.toHaveProperty('const');
			expect(result.properties.user.properties.age).not.toHaveProperty('exclusiveMinimum');
			expect(result.properties.user.properties.name.type).toBe('string');
		});

		it('should handle array items correctly', () => {
			const input = {
				type: 'array',
				items: [
					{ type: 'string' },
					{ type: 'number' },
				],
			};

			const result = converter.convertSchema(input);

			expect(result.type).toBe('array');
			expect(result.items).toEqual({ type: 'string' }); // Should use first item
		});

		it('should preserve valid properties', () => {
			const input = {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						minLength: 1,
						maxLength: 100,
					},
					count: {
						type: 'integer',
						minimum: 0,
						maximum: 1000,
					},
				},
				required: ['name'],
			};

			const result = converter.convertSchema(input);

			expect(result.type).toBe('object');
			expect(result.required).toEqual(['name']);
			expect(result.properties.name.minLength).toBe(1);
			expect(result.properties.name.maxLength).toBe(100);
			expect(result.properties.count.minimum).toBe(0);
			expect(result.properties.count.maximum).toBe(1000);
		});
	});

	describe('convertSingleTool', () => {
		it('should convert OpenAI-style tool format', () => {
			const tool = {
				type: 'function',
				function: {
					name: 'test_tool',
					description: 'A test tool',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						type: 'object',
						properties: {
							query: { type: 'string' },
						},
						required: ['query'],
					},
				},
			};

			const result = converter.convertSingleTool(tool);

			expect(result.functionDeclarations).toHaveLength(1);
			const declaration = result.functionDeclarations[0];
			expect(declaration.name).toBe('test_tool');
			expect(declaration.description).toBe('A test tool');
			expect(declaration.parameters).not.toHaveProperty('$schema');
			expect(declaration.parameters.properties.query.type).toBe('string');
		});

		it('should convert direct tool format', () => {
			const tool = {
				name: 'direct_tool',
				description: 'A direct tool',
				parameters: {
					type: 'object',
					properties: {
						input: {
							type: ['string', 'null'],
							exclusiveMinimum: 0,
						},
					},
				},
			};

			const result = converter.convertSingleTool(tool);

			expect(result.functionDeclarations).toHaveLength(1);
			const declaration = result.functionDeclarations[0];
			expect(declaration.name).toBe('direct_tool');
			expect(declaration.parameters.properties.input.type).toBe('string');
			expect(declaration.parameters.properties.input).not.toHaveProperty('exclusiveMinimum');
		});
	});

	describe('convertToolsArray', () => {
		it('should convert multiple tools', () => {
			const tools = [
				{
					type: 'function',
					function: {
						name: 'tool1',
						description: 'Tool 1',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							type: 'object',
						},
					},
				},
				{
					name: 'tool2',
					description: 'Tool 2',
					parameters: {
						type: 'object',
						const: 'remove-me',
					},
				},
			];

			const result = converter.convertToolsArray(tools);

			expect(result).toHaveLength(2);
			expect(result[0].functionDeclarations[0].name).toBe('tool1');
			expect(result[1].functionDeclarations[0].name).toBe('tool2');
			expect(result[0].functionDeclarations[0].parameters).not.toHaveProperty('$schema');
			expect(result[1].functionDeclarations[0].parameters).not.toHaveProperty('const');
		});
	});

	describe('static helpers', () => {
		it('should provide static convert method', () => {
			const input = {
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'string',
			};

			const result = GeminiSchemaConverter.convert(input);

			expect(result).not.toHaveProperty('$schema');
			expect(result.type).toBe('string');
		});

		it('should provide static convertTools method', () => {
			const tools = [
				{
					type: 'function',
					function: {
						name: 'static_test',
						description: 'Static test',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							type: 'object',
						},
					},
				},
			];

			const result = GeminiSchemaConverter.convertTools(tools);

			expect(result).toHaveLength(1);
			expect(result[0].functionDeclarations[0].name).toBe('static_test');
			expect(result[0].functionDeclarations[0].parameters).not.toHaveProperty('$schema');
		});
	});

	describe('edge cases', () => {
		it('should handle null and undefined inputs', () => {
			expect(converter.convertSchema(null)).toBeNull();
			expect(converter.convertSchema(undefined)).toBeUndefined();
		});

		it('should handle primitive values', () => {
			expect(converter.convertSchema('string')).toBe('string');
			expect(converter.convertSchema(42)).toBe(42);
			expect(converter.convertSchema(true)).toBe(true);
		});

		it('should handle empty objects', () => {
			const result = converter.convertSchema({});
			expect(result).toEqual({});
		});

		it('should handle deep nesting', () => {
			const input = {
				level1: {
					level2: {
						level3: {
							$schema: 'remove-me',
							type: 'string',
						},
					},
				},
			};

			const result = converter.convertSchema(input);

			expect(result.level1.level2.level3).not.toHaveProperty('$schema');
			expect(result.level1.level2.level3.type).toBe('string');
		});
	});
});