/**
 * TypeScript Type Definitions for A2A AgenticDirect
 * Uses types from @a2a-js/sdk for A2A v0.3.0 compliance
 */

// Import types from official SDK
import type {
  AgentCard as SDKAgentCard,
  AgentSkill,
  AgentCapabilities as SDKAgentCapabilities,
  Message as SDKMessage,
  Part as SDKPart,
  TextPart as SDKTextPart,
  DataPart as SDKDataPart,
  FilePart as SDKFilePart,
  Task as SDKTask,
  TaskStatus as SDKTaskStatus,
  JSONRPCRequest as SDKJSONRPCRequest,
  JSONRPCResponse as SDKJSONRPCResponse,
  JSONRPCError as SDKJSONRPCError
} from '@a2a-js/sdk';

// Extended AgentCapabilities with custom fields
export interface Capabilities extends SDKAgentCapabilities {
  mcpIntegration?: boolean;
}

// Extended AgentCard to support custom capabilities and interfaces
export interface AgentCard extends Omit<SDKAgentCard, 'capabilities' | 'additionalInterfaces'> {
  capabilities: Capabilities;
  additionalInterfaces: AdditionalInterface[];
}

// Extended TaskStatus to include message field as string (not Message object)
export interface TaskStatus extends Omit<SDKTaskStatus, 'message'> {
  message?: string;
}

// Extended Message to include timestamp
export interface Message extends Omit<SDKMessage, 'timestamp'> {
  timestamp?: string;
}

// Extended Task to make history array always defined and use extended TaskStatus
export interface Task extends Omit<SDKTask, 'history' | 'status'> {
  history: Message[];
  status: TaskStatus;
}

// Re-export SDK types
export type Skill = AgentSkill;
export type Part = SDKPart;
export type TextPart = SDKTextPart;
export type DataPart = SDKDataPart;
export type FilePart = SDKFilePart;
export type JSONRPCRequest = SDKJSONRPCRequest;
export type JSONRPCResponse = SDKJSONRPCResponse;
export type JSONRPCError = SDKJSONRPCError;

// Keep custom extended types for compatibility
export interface AdditionalInterface {
  protocol: string;
  version: string;
  transport: string;
  url?: string;
  tools?: string[];
}

// MCP Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export interface MCPToolHandler {
  (params: any): Promise<any>;
}

// OpenDirect Types
export interface OpenDirectSchema {
  // MCP format fields
  name?: string;
  version?: string;
  description?: string;
  tools?: MCPTool[];
  schemas?: Record<string, Schema>;

  // OpenAPI 3.0 format fields (fallback)
  openapi?: string;
  info?: {
    title: string;
    version: string;
  };
  paths?: Record<string, PathItem>;
  components?: {
    schemas: Record<string, Schema>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

export interface Operation {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: Schema;
}

export interface RequestBody {
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface MediaType {
  schema: Schema;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

export interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  description?: string;
  $ref?: string;
  [key: string]: any;
}

// Agent Executor Types
export interface ExecutionContext {
  message: Message;
  contextId: string;
  taskId: string;
  metadata?: Record<string, any>;
}

export interface EventBus {
  publish(event: Message): void;
  finished(): void;
}

// Configuration Types
export interface ServerConfig {
  port: number;
  env: string;
  openaiApiKey: string;
  openaiModel: string;
  mcpEnableAdminTools: boolean;
}
