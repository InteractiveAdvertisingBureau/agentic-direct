/**
 * OpenDirect Schema Parser
 * Parses OpenAPI 3.0 specification and extracts tools, resources, and schemas
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { OpenDirectSchema, MCPTool, Operation, Schema } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SchemaParser {
  private schema: OpenDirectSchema;
  private tools: MCPTool[] = [];
  private resources: string[] = [];

  constructor(schemaPath?: string) {
    const path = schemaPath || join(__dirname, '../../../opendirect.json');
    const schemaContent = readFileSync(path, 'utf-8');
    this.schema = JSON.parse(schemaContent);
  }

  /**
   * Parse the schema and extract all tools
   */
  parseTools(): MCPTool[] {
    if (this.tools.length > 0) return this.tools;

    console.log('🔧 Parsing OpenDirect schema...');

    // Check if schema already has tools in MCP format
    if (this.schema.tools && Array.isArray(this.schema.tools)) {
      console.log('📦 Found tools in MCP format');
      this.tools = this.schema.tools;
      console.log(`✅ Loaded ${this.tools.length} tools from schema`);
      return this.tools;
    }

    // Fallback: Parse from OpenAPI paths format
    if (this.schema.paths) {
      console.log('📦 Parsing tools from OpenAPI paths');
      for (const [path, pathItem] of Object.entries(this.schema.paths)) {
        // Process each HTTP method
        for (const [method, operation] of Object.entries(pathItem)) {
          if (this.isValidOperation(operation)) {
            const tool = this.operationToTool(path, method, operation as Operation);
            if (tool) {
              this.tools.push(tool);
            }
          }
        }
      }
    }

    console.log(`✅ Parsed ${this.tools.length} tools from schema`);
    return this.tools;
  }

  /**
   * Extract resource types from schema
   */
  parseResources(): string[] {
    if (this.resources.length > 0) return this.resources;

    console.log('📋 Extracting resources from schema...');

    if (this.schema.components?.schemas) {
      this.resources = Object.keys(this.schema.components.schemas);
    }

    console.log(`✅ Found ${this.resources.length} resource types`);
    return this.resources;
  }

  /**
   * Get schema definition for a resource
   */
  getSchemaDefinition(name: string): Schema | undefined {
    return this.schema.components?.schemas?.[name];
  }

  /**
   * Convert OpenAPI operation to MCP tool
   */
  private operationToTool(path: string, method: string, operation: Operation): MCPTool | null {
    const { operationId, summary, description, parameters = [], requestBody } = operation;

    if (!operationId) {
      console.warn(`⚠️  Skipping operation without operationId: ${method.toUpperCase()} ${path}`);
      return null;
    }

    // Build input schema from parameters and request body
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Add path/query parameters
    for (const param of parameters) {
      if (param.name) {
        properties[param.name] = this.schemaToJSONSchema(param.schema);
        if (param.required) {
          required.push(param.name);
        }
      }
    }

    // Add request body properties
    if (requestBody?.content?.['application/json']?.schema) {
      const bodySchema = requestBody.content['application/json'].schema;
      const resolvedSchema = this.resolveSchema(bodySchema);

      if (resolvedSchema.properties) {
        Object.assign(properties, resolvedSchema.properties);
        if (resolvedSchema.required) {
          required.push(...resolvedSchema.required);
        }
      }
    }

    return {
      name: operationId,
      description: description || summary || `Execute ${operationId}`,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 && { required })
      }
    };
  }

  /**
   * Resolve schema references ($ref)
   */
  private resolveSchema(schema: Schema): Schema {
    if (schema.$ref) {
      const refPath = schema.$ref.split('/').pop();
      if (refPath) {
        return this.schema.components?.schemas?.[refPath] || schema;
      }
    }
    return schema;
  }

  /**
   * Convert OpenAPI schema to JSON Schema
   */
  private schemaToJSONSchema(schema: Schema): any {
    const resolved = this.resolveSchema(schema);

    return {
      type: resolved.type || 'string',
      description: resolved.description,
      ...(resolved.enum && { enum: resolved.enum }),
      ...(resolved.format && { format: resolved.format }),
      ...(resolved.items && { items: this.schemaToJSONSchema(resolved.items) }),
      ...(resolved.properties && {
        properties: Object.fromEntries(
          Object.entries(resolved.properties).map(([key, val]) => [
            key,
            this.schemaToJSONSchema(val as Schema)
          ])
        )
      })
    };
  }

  /**
   * Check if operation is valid
   */
  private isValidOperation(value: any): boolean {
    return value && typeof value === 'object' && 'operationId' in value;
  }

  /**
   * Get schema info
   */
  getSchemaInfo() {
    return {
      title: this.schema.name || this.schema.info?.title || 'OpenDirect Schema',
      version: this.schema.version || this.schema.info?.version || '1.0.0',
      toolCount: this.tools.length,
      resourceCount: this.resources.length
    };
  }
}
