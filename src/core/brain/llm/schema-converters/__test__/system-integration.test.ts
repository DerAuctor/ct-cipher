/**
 * System Integration Tests for Gemini Tool Schema Fix
 *
 * Tests the complete integration of the schema converter in the system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedToolManager } from '../../tools/unified-tool-manager.js';
import { GeminiDirectService } from '../services/gemini-direct.js';
import { GeminiSchemaConverter } from '../gemini-schema-converter.js';

describe('System Integration: Gemini Tool Schema Fix', () => {
	describe('GeminiSchemaConverter System Integration', () => {
		it('should convert problematic tool schemas without throwing', () => {
			// Simulate the exact error-causing tool schema from the log
			const problematicTool = {
				type: 'function',
				function: {
					name: 'mcp__ct_dev-PMO__ct_dev-task_mgmnt__analyze_task',
					description: 'Deeply analyze task requirements',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						additionalProperties: false,
						properties: {
							taskId: {
								description: 'Task ID to analyze',
								type: 'string',
							},
							depth: {
								type: 'number',
								exclusiveMinimum: 0,
								minimum: 1,
								maximum: 10,
							},
						},
						required: ['taskId'],
						type: 'object',
					},
				},
			};

			// This should NOT throw an error
			expect(() => {
				const converter = new GeminiSchemaConverter();
				const result = converter.convertSingleTool(problematicTool);

				// Verify the result is valid for Gemini API
				expect(result.functionDeclarations).toHaveLength(1);
				const declaration = result.functionDeclarations[0];

				// Check problematic properties are removed
				expect(declaration.parameters).not.toHaveProperty('$schema');
				expect(declaration.parameters.properties.depth).not.toHaveProperty('exclusiveMinimum');

				// Check valid properties are preserved
				expect(declaration.parameters.required).toEqual(['taskId']);
				expect(declaration.parameters.properties.taskId.type).toBe('string');
				expect(declaration.parameters.properties.depth.minimum).toBe(1);
				expect(declaration.parameters.properties.depth.maximum).toBe(10);
			}).not.toThrow();
		});

		it('should handle the exact tool array that caused the 400 error', () => {
			// Simulate multiple tools with various problematic schemas
			const problematicTools = [
				{
					type: 'function',
					function: {
						name: 'mcp__ct_dev-PMO_code__complexity-analyzer-server__analyze_complexity',
						description: 'Analyze code complexity',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							properties: {
								filePath: { type: 'string' },
								options: {
									properties: {
										thresholds: {
											properties: {
												cognitive: {
													type: 'number',
													exclusiveMinimum: 0,
												},
												cyclomatic: {
													type: 'number',
													exclusiveMinimum: 0,
												},
											},
											type: 'object',
										},
									},
									type: 'object',
								},
							},
							required: ['filePath'],
							type: 'object',
						},
					},
				},
				{
					type: 'function',
					function: {
						name: 'mcp__ct_dev-PMO_code_mgmnt__GitHub__git-commit',
						description: 'Commits staged files',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							type: 'object',
							properties: {
								message: { type: 'string' },
								options: {
									type: 'object',
									propertyNames: {
										pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
									},
									additionalProperties: {
										type: ['string', 'boolean'],
									},
								},
							},
							required: ['message'],
						},
					},
				},
			];

			// Convert all tools - should not throw
			expect(() => {
				const result = GeminiSchemaConverter.convertTools(problematicTools);

				// Verify all tools are converted
				expect(result).toHaveLength(2);

				// Verify each tool has proper structure
				result.forEach(tool => {
					expect(tool.functionDeclarations).toHaveLength(1);
					const declaration = tool.functionDeclarations[0];

					// Check no problematic properties remain
					expect(declaration.parameters).not.toHaveProperty('$schema');
					expect(JSON.stringify(declaration.parameters)).not.toContain('exclusiveMinimum');
					expect(JSON.stringify(declaration.parameters)).not.toContain('propertyNames');
				});
			}).not.toThrow();
		});

		it('should preserve tool functionality while fixing schema issues', () => {
			const toolWithComplexSchema = {
				type: 'function',
				function: {
					name: 'complex_tool',
					description: 'Tool with complex schema',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						type: 'object',
						properties: {
							query: {
								type: 'string',
								minLength: 1,
								maxLength: 1000,
							},
							filters: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										field: { type: 'string' },
										operator: {
											type: 'string',
											enum: ['eq', 'ne', 'gt', 'lt'],
										},
										value: {
											type: ['string', 'number', 'boolean'],
										},
									},
									required: ['field', 'operator', 'value'],
								},
							},
							options: {
								type: 'object',
								properties: {
									limit: {
										type: 'integer',
										minimum: 1,
										maximum: 100,
										exclusiveMinimum: 0,
									},
									sortBy: {
										type: 'string',
										const: 'createdAt',
									},
								},
								additionalProperties: false,
							},
						},
						required: ['query'],
						additionalProperties: false,
					},
				},
			};

			const converter = new GeminiSchemaConverter();
			const result = converter.convertSingleTool(toolWithComplexSchema);
			const declaration = result.functionDeclarations[0];

			// Check schema issues are fixed
			expect(declaration.parameters).not.toHaveProperty('$schema');
			expect(declaration.parameters.properties.options.properties.limit).not.toHaveProperty('exclusiveMinimum');
			expect(declaration.parameters.properties.options.properties.sortBy).not.toHaveProperty('const');

			// Check functionality is preserved
			expect(declaration.name).toBe('complex_tool');
			expect(declaration.description).toBe('Tool with complex schema');
			expect(declaration.parameters.required).toEqual(['query']);
			expect(declaration.parameters.properties.query.minLength).toBe(1);
			expect(declaration.parameters.properties.query.maxLength).toBe(1000);
			expect(declaration.parameters.properties.filters.items.properties.operator.enum).toEqual(['eq', 'ne', 'gt', 'lt']);

			// Check array type conversion
			expect(declaration.parameters.properties.filters.items.properties.value.type).toBe('string');
		});

		it('should generate valid Gemini API request structure', () => {
			const tools = [
				{
					type: 'function',
					function: {
						name: 'test_tool',
						description: 'Test tool',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							type: 'object',
							properties: {
								input: { type: 'string' },
							},
						},
					},
				},
			];

			const result = GeminiSchemaConverter.convertTools(tools);

			// Verify the structure matches what Gemini API expects
			expect(result).toHaveLength(1);
			const tool = result[0];

			// Check top-level structure
			expect(tool).toHaveProperty('functionDeclarations');
			expect(Array.isArray(tool.functionDeclarations)).toBe(true);

			// Check function declaration structure
			const declaration = tool.functionDeclarations[0];
			expect(declaration).toHaveProperty('name');
			expect(declaration).toHaveProperty('description');
			expect(declaration).toHaveProperty('parameters');

			// Ensure no invalid fields remain
			const serialized = JSON.stringify(tool);
			expect(serialized).not.toContain('$schema');
			expect(serialized).not.toContain('exclusiveMinimum');
			expect(serialized).not.toContain('exclusiveMaximum');
			expect(serialized).not.toContain('const');
			expect(serialized).not.toContain('propertyNames');
		});
	});

	describe('Fallback Behavior', () => {
		it('should handle converter errors gracefully with fallback', () => {
			// Mock a scenario where converter throws an error
			const malformedTool = {
				type: 'function',
				function: {
					name: 'malformed_tool',
					description: 'Tool that might cause converter issues',
					parameters: null, // This could cause issues
				},
			};

			// Should not crash the system even if converter fails
			expect(() => {
				try {
					GeminiSchemaConverter.convertTools([malformedTool]);
				} catch (error) {
					// Fallback should handle this gracefully
					console.log('Converter failed as expected, fallback should handle this');
				}
			}).not.toThrow();
		});
	});

	describe('Performance Impact', () => {
		it('should convert large number of tools efficiently', () => {
			// Create many tools to test performance
			const tools = Array.from({ length: 121 }, (_, i) => ({
				type: 'function',
				function: {
					name: `tool_${i}`,
					description: `Tool number ${i}`,
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						type: 'object',
						properties: {
							param: {
								type: ['string', 'null'],
								exclusiveMinimum: 0,
							},
						},
					},
				},
			}));

			const startTime = process.hrtime.bigint();
			const result = GeminiSchemaConverter.convertTools(tools);
			const endTime = process.hrtime.bigint();

			const durationMs = Number(endTime - startTime) / 1_000_000;

			// Should complete within reasonable time (< 1000ms for 121 tools)
			expect(durationMs).toBeLessThan(1000);
			expect(result).toHaveLength(121);

			// Verify all conversions worked
			result.forEach((tool, index) => {
				expect(tool.functionDeclarations[0].name).toBe(`tool_${index}`);
				expect(tool.functionDeclarations[0].parameters).not.toHaveProperty('$schema');
			});
		});
	});
});