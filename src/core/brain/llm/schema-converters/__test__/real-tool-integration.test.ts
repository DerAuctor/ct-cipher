/**
 * Integration tests for GeminiSchemaConverter with real MCP tool schemas
 *
 * Tests conversion of actual tool schemas that caused the original error
 */

import { describe, it, expect } from 'vitest';
import { GeminiSchemaConverter } from '../gemini-schema-converter.js';

describe('GeminiSchemaConverter Real Tool Integration', () => {
	const converter = new GeminiSchemaConverter({
		logWarnings: false, // Disable warnings for cleaner test output
	});

	describe('MCP Tool Schema Examples', () => {
		it('should convert typical MCP tool schema with $schema', () => {
			const mcpTool = {
				type: 'function',
				function: {
					name: 'mcp__ct_dev-PMO__ct_dev-task_mgmnt__analyze_task',
					description: 'Deeply analyze task requirements and systematically examine the codebase',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						additionalProperties: false,
						properties: {
							taskId: {
								description: 'Task ID to analyze',
								type: 'string',
							},
							options: {
								description: 'Analysis options',
								properties: {
									depth: {
										type: 'number',
										minimum: 1,
										maximum: 10,
										exclusiveMinimum: 0,
									},
								},
								type: 'object',
							},
						},
						required: ['taskId'],
						type: 'object',
					},
				},
			};

			const result = converter.convertSingleTool(mcpTool);

			expect(result.functionDeclarations).toHaveLength(1);
			const declaration = result.functionDeclarations[0];

			// Check name and description are preserved
			expect(declaration.name).toBe('mcp__ct_dev-PMO__ct_dev-task_mgmnt__analyze_task');
			expect(declaration.description).toBe('Deeply analyze task requirements and systematically examine the codebase');

			// Check unsupported properties are removed
			expect(declaration.parameters).not.toHaveProperty('$schema');
			expect(declaration.parameters.properties.options.properties.depth).not.toHaveProperty('exclusiveMinimum');

			// Check valid properties are preserved
			expect(declaration.parameters.required).toEqual(['taskId']);
			expect(declaration.parameters.properties.taskId.type).toBe('string');
			expect(declaration.parameters.properties.options.properties.depth.minimum).toBe(1);
		});

		it('should convert complexity analyzer tool with exclusiveMinimum', () => {
			const complexityTool = {
				type: 'function',
				function: {
					name: 'mcp__ct_dev-PMO_code__complexity-analyzer-server__analyze_complexity',
					description: 'Analyze code complexity with comprehensive metrics',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						additionalProperties: false,
						properties: {
							filePath: {
								description: 'Path to the file to analyze',
								type: 'string',
							},
							options: {
								description: 'Complexity analysis options',
								properties: {
									thresholds: {
										description: 'Custom thresholds for complexity metrics',
										properties: {
											cognitive: {
												description: 'Cognitive complexity threshold',
												type: 'number',
												exclusiveMinimum: 0,
											},
											cyclomatic: {
												description: 'Cyclomatic complexity threshold',
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
			};

			const result = converter.convertSingleTool(complexityTool);
			const declaration = result.functionDeclarations[0];

			// Check problematic properties are removed
			expect(declaration.parameters).not.toHaveProperty('$schema');
			expect(declaration.parameters.properties.options.properties.thresholds.properties.cognitive).not.toHaveProperty('exclusiveMinimum');
			expect(declaration.parameters.properties.options.properties.thresholds.properties.cyclomatic).not.toHaveProperty('exclusiveMinimum');

			// Check structure is preserved
			expect(declaration.parameters.required).toEqual(['filePath']);
			expect(declaration.parameters.properties.filePath.type).toBe('string');
		});

		it('should convert dependency analysis tool with array types', () => {
			const dependencyTool = {
				name: 'mcp__ct_dev-PMO_code__dependency-analysis-server__analyze_dependencies',
				description: 'Analyze project dependencies and generate comprehensive report',
				parameters: {
					$schema: 'http://json-schema.org/draft-07/schema#',
					additionalProperties: false,
					properties: {
						projectPath: {
							description: 'Path to the project directory',
							type: 'string',
						},
						includeDev: {
							default: true,
							description: 'Include development dependencies',
							type: 'boolean',
						},
						packageTypes: {
							description: 'Types of packages to include',
							type: 'array',
							items: {
								type: ['string', 'null'], // This should be converted
								enum: ['production', 'development', 'optional', 'peer'],
							},
						},
					},
					required: ['projectPath'],
					type: 'object',
				},
			};

			const result = converter.convertSingleTool(dependencyTool);
			const declaration = result.functionDeclarations[0];

			// Check $schema is removed
			expect(declaration.parameters).not.toHaveProperty('$schema');

			// Check array type is simplified to string
			expect(declaration.parameters.properties.packageTypes.items.type).toBe('string');

			// Check enum is preserved
			expect(declaration.parameters.properties.packageTypes.items.enum).toEqual([
				'production', 'development', 'optional', 'peer'
			]);
		});

		it('should convert GitHub tool with propertyNames', () => {
			const githubTool = {
				type: 'function',
				function: {
					name: 'mcp__ct_dev-PMO_code_mgmnt__GitHub__git-commit',
					description: 'Commits staged files',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						type: 'object',
						properties: {
							message: {
								type: 'string',
								description: 'Commit message',
							},
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
			};

			const result = converter.convertSingleTool(githubTool);
			const declaration = result.functionDeclarations[0];

			// Check unsupported properties are removed
			expect(declaration.parameters).not.toHaveProperty('$schema');
			expect(declaration.parameters.properties.options).not.toHaveProperty('propertyNames');

			// Check additionalProperties type array is simplified
			expect(declaration.parameters.properties.options.additionalProperties.type).toBe('string');

			// Check required structure
			expect(declaration.parameters.required).toEqual(['message']);
		});

		it('should convert const value properties', () => {
			const toolWithConst = {
				type: 'function',
				function: {
					name: 'test_tool_with_const',
					description: 'Tool with const values',
					parameters: {
						$schema: 'http://json-schema.org/draft-07/schema#',
						type: 'object',
						properties: {
							action: {
								const: 'fixed-action',
								description: 'Fixed action type',
							},
							config: {
								type: 'object',
								properties: {
									mode: {
										const: 'production',
									},
									version: {
										type: 'string',
									},
								},
							},
						},
					},
				},
			};

			const result = converter.convertSingleTool(toolWithConst);
			const declaration = result.functionDeclarations[0];

			// Check const properties are removed
			expect(declaration.parameters.properties.action).not.toHaveProperty('const');
			expect(declaration.parameters.properties.config.properties.mode).not.toHaveProperty('const');

			// Check descriptions are preserved
			expect(declaration.parameters.properties.action.description).toBe('Fixed action type');
		});
	});

	describe('Batch conversion of tools', () => {
		it('should convert multiple problematic tools at once', () => {
			const tools = [
				{
					type: 'function',
					function: {
						name: 'tool1',
						description: 'Tool 1',
						parameters: {
							$schema: 'http://json-schema.org/draft-07/schema#',
							type: 'object',
							properties: {
								param1: {
									type: ['string', 'null'],
									exclusiveMinimum: 0,
								},
							},
						},
					},
				},
				{
					name: 'tool2',
					description: 'Tool 2',
					parameters: {
						type: 'object',
						propertyNames: { pattern: '^[a-z]+$' },
						properties: {
							param2: {
								const: 'fixed',
							},
						},
					},
				},
			];

			const result = converter.convertToolsArray(tools);

			expect(result).toHaveLength(2);

			// First tool checks
			const tool1 = result[0].functionDeclarations[0];
			expect(tool1.parameters).not.toHaveProperty('$schema');
			expect(tool1.parameters.properties.param1.type).toBe('string');
			expect(tool1.parameters.properties.param1).not.toHaveProperty('exclusiveMinimum');

			// Second tool checks
			const tool2 = result[1].functionDeclarations[0];
			expect(tool2.parameters).not.toHaveProperty('propertyNames');
			expect(tool2.parameters.properties.param2).not.toHaveProperty('const');
		});
	});

	describe('Error handling', () => {
		it('should handle malformed schemas gracefully', () => {
			const malformedTool = {
				type: 'function',
				function: {
					name: 'malformed_tool',
					description: 'Tool with malformed schema',
					parameters: {
						// Circular reference would cause issues in some converters
						type: 'object',
						properties: {},
					},
				},
			};

			// Add circular reference
			malformedTool.function.parameters.properties.self = malformedTool.function.parameters;

			// Should not throw but handle gracefully
			expect(() => {
				converter.convertSingleTool(malformedTool);
			}).not.toThrow();
		});

		it('should handle deeply nested schemas', () => {
			const deepTool = {
				type: 'function',
				function: {
					name: 'deep_tool',
					description: 'Tool with deep nesting',
					parameters: {
						type: 'object',
						properties: {
							level1: {
								type: 'object',
								properties: {
									level2: {
										type: 'object',
										properties: {
											level3: {
												$schema: 'should-be-removed',
												type: 'string',
												exclusiveMinimum: 0,
											},
										},
									},
								},
							},
						},
					},
				},
			};

			const result = converter.convertSingleTool(deepTool);
			const params = result.functionDeclarations[0].parameters;

			expect(params.properties.level1.properties.level2.properties.level3).not.toHaveProperty('$schema');
			expect(params.properties.level1.properties.level2.properties.level3).not.toHaveProperty('exclusiveMinimum');
		});
	});
});