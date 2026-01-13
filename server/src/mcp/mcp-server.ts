/**
 * Schema-Driven MCP Server
 * Exposes OpenDirect operations as MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { SchemaParser } from './schema-parser.js';
import type { MCPTool, MCPToolHandler } from '../types/index.js';

export class MCPServer {
  private server: Server;
  private parser: SchemaParser;
  private tools: MCPTool[] = [];
  private toolHandlers: Map<string, MCPToolHandler> = new Map();

  constructor() {
    this.parser = new SchemaParser();
    this.server = new Server(
      {
        name: 'opendirect-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize MCP server with tools from schema
   */
  async initialize() {
    console.log('🔄 Initializing Schema-Driven MCP Server...');

    // Parse tools from schema
    this.tools = this.parser.parseTools();

    // Register tool handlers
    this.registerToolHandlers();

    console.log('✅ MCP Server initialized');
    console.log(`📋 Tools: ${this.tools.length}`);
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = this.toolHandlers.get(name);
      if (!handler) {
        throw new Error(`Tool not found: ${name}`);
      }

      try {
        const result = await handler(args || {});
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = this.parser.parseResources();
      return {
        resources: resources.map(name => ({
          uri: `opendirect:///${name}`,
          name,
          mimeType: 'application/json',
          description: `OpenDirect ${name} resource`
        }))
      };
    });
  }

  /**
   * Register handlers for all tools
   */
  private registerToolHandlers() {
    for (const tool of this.tools) {
      this.toolHandlers.set(tool.name, this.createToolHandler(tool));
    }
  }

  /**
   * Create a generic tool handler
   * This is where actual business logic would be implemented
   */
  private createToolHandler(tool: MCPTool): MCPToolHandler {
    return async (params: any) => {
      console.log(`🔧 Executing tool: ${tool.name}`);
      console.log(`📝 Parameters:`, JSON.stringify(params, null, 2));

      // For this clean implementation, we'll return mock responses
      // In production, this would call actual APIs or database operations

      const result = this.generateMockResponse(tool.name, params);

      console.log(`✅ Tool ${tool.name} completed`);
      return result;
    };
  }

  /**
   * Generate mock response for demonstration
   * Replace with actual implementation in production
   */
  private generateMockResponse(toolName: string, params: any): any {
    const id = uuidv4();

    // Account operations
    if (toolName.includes('account')) {
      return {
        id,
        name: params.name || 'Mock Account',
        type: params.type || 'advertiser',
        status: 'active',
        createdAt: new Date().toISOString()
      };
    }

    // Order operations
    if (toolName.includes('order')) {
      return {
        id,
        accountId: params.accountId || uuidv4(),
        name: params.name || 'Mock Order',
        budget: params.budget || 10000,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
    }

    // Product operations
    if (toolName.includes('product')) {
      return {
        id,
        name: params.name || 'Mock Product',
        type: 'display',
        rate: 10.0,
        available: true,
        createdAt: new Date().toISOString()
      };
    }

    // Creative operations
    if (toolName.includes('creative')) {
      return {
        id,
        name: params.name || 'Mock Creative',
        adFormat: params.adFormat || 'banner',
        status: 'pending_review',
        createdAt: new Date().toISOString()
      };
    }

    // Generic response
    return {
      id,
      ...params,
      status: 'success',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get tool handlers for A2A integration
   */
  getToolHandlers(): Map<string, MCPToolHandler> {
    return this.toolHandlers;
  }

  /**
   * Get tools list
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Get the underlying MCP server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Call a tool using MCP protocol
   * This provides programmatic access to tools through the MCP request/response flow
   */
  async callTool(toolName: string, args: any): Promise<any> {
    console.log(`🔌 MCP Protocol: Calling tool ${toolName}`);

    const handler = this.toolHandlers.get(toolName);
    if (!handler) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      const result = await handler(args || {});

      // Return result in MCP response format
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create HTTP transport for MCP
   */
  createHttpTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // Stateless mode
    });
  }

  /**
   * Start server (for stdio transport)
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🚀 MCP Server running on stdio');
  }
}
