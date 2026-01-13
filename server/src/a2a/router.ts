/**
 * A2A Express Router
 * Handles JSON-RPC 2.0 requests and agent card discovery
 * Uses @a2a-js/sdk for A2A v0.3.0 compliance
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { AgentCardGenerator } from './agent-card.js';
import { AgentExecutor } from './executor.js';
import type { MCPServer } from '../mcp/mcp-server.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  Task,
  Message,
  MCPTool,
  EventBus
} from '../types/index.js';

export class A2ARouter {
  private router: Router;
  private role: 'buyer' | 'seller';
  private mcpServer: MCPServer;
  private tools: MCPTool[];
  private tasks: Map<string, Task> = new Map();
  private openaiApiKey: string;

  constructor(
    role: 'buyer' | 'seller',
    mcpServer: MCPServer,
    tools: MCPTool[],
    openaiApiKey: string
  ) {
    this.role = role;
    this.mcpServer = mcpServer;
    this.tools = tools;
    this.openaiApiKey = openaiApiKey;
    this.router = Router();
    this.setupRoutes();
  }

  /**
   * Setup Express routes
   */
  private setupRoutes() {
    // Agent card discovery (A2A standard) - using SDK constant
    this.router.get(`/${AGENT_CARD_PATH}`, (req, res) => {
      const agentCard = AgentCardGenerator.createAgentCard(this.role, this.tools, req);
      res.json(agentCard);
    });

    // Legacy /card endpoint for backwards compatibility
    this.router.get('/card', (req, res) => {
      const agentCard = AgentCardGenerator.createAgentCard(this.role, this.tools, req);
      res.json(agentCard);
    });

    // Default endpoint at root - forward to JSON-RPC (A2A v0.3.0 expects POST to url)
    this.router.post('/', async (req, res) => {
      await this.handleJSONRPC(req, res);
    });

    // JSON-RPC 2.0 endpoint
    this.router.post('/jsonrpc', async (req, res) => {
      await this.handleJSONRPC(req, res);
    });

    // REST/HTTP+JSON transport (A2A standard)
    this.router.post('/rest/sendMessage', async (req, res) => {
      await this.handleRESTSendMessage(req, res);
    });

    this.router.get('/rest/getTask/:taskId', (req, res) => {
      this.handleRESTGetTask(req, res);
    });

    this.router.post('/rest/cancelTask/:taskId', (req, res) => {
      this.handleRESTCancelTask(req, res);
    });
  }

  /**
   * Handle JSON-RPC 2.0 requests
   */
  private async handleJSONRPC(req: Request, res: Response) {
    const request = req.body as JSONRPCRequest;

    console.log(`📥 JSON-RPC request: method="${request.method}", id=${request.id}`);

    // Validate JSON-RPC version
    if (request.jsonrpc !== '2.0') {
      return res.json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: request.id || null
      });
    }

    try {
      let result: any;

      switch (request.method) {
        case 'sendMessage':
        case 'message/send':  // Official A2A client uses this format
          result = await this.handleSendMessage(request.params);
          break;

        case 'getTask':
        case 'task/get':
        case 'tasks/get':  // Official A2A client uses this format (plural)
          result = this.handleGetTaskRPC(request.params);
          break;

        case 'cancelTask':
        case 'task/cancel':
          result = this.handleCancelTask(request.params);
          break;

        default:
          throw this.createRPCError(-32601, `Method not found: ${request.method}`);
      }

      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        result,
        id: request.id ?? null
      };

      res.json(response);

    } catch (error) {
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        error: error as JSONRPCError,
        id: request.id ?? null
      };

      res.status(400).json(errorResponse);
    }
  }

  /**
   * Handle sendMessage method
   */
  private async handleSendMessage(params: any): Promise<Task> {
    const { message, contextId } = params;

    if (!message) {
      throw this.createRPCError(-32602, 'Invalid params: message required');
    }

    // Create or get task
    const taskId = uuidv4();
    const task: Task = {
      kind: 'task',
      id: taskId,
      contextId: contextId || uuidv4(),
      status: {
        state: 'working',
        timestamp: new Date().toISOString()
      },
      history: [message]
    };

    this.tasks.set(taskId, task);

    // Create event bus for agent executor
    const eventBus: EventBus = {
      publish: (event: Message) => {
        task.history.push(event);
        console.log(`📨 Event published to task ${taskId}`);
      },
      finished: () => {
        task.status = {
          state: 'completed',
          timestamp: new Date().toISOString()
        };
        console.log(`✅ Task ${taskId} completed`);
      }
    };

    // Execute asynchronously
    const executor = new AgentExecutor(
      this.role,
      this.mcpServer,
      this.tools,
      this.openaiApiKey
    );

    // Execute in background
    executor.execute(
      {
        message,
        contextId: task.contextId,
        taskId
      },
      eventBus
    ).catch(error => {
      console.error(`❌ Task ${taskId} failed:`, error);
      task.status = {
        state: 'failed',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error)
      };
    });

    return task;
  }

  /**
   * Handle getTask method (JSON-RPC)
   */
  private handleGetTaskRPC(params: any): Task {
    const { taskId } = params;

    if (!taskId) {
      throw this.createRPCError(-32602, 'Invalid params: taskId required');
    }

    const task = this.tasks.get(taskId);

    if (!task) {
      throw this.createRPCError(-32000, `Task not found: ${taskId}`);
    }

    return task;
  }

  /**
   * Handle cancelTask method
   */
  private handleCancelTask(params: any): Task {
    const { taskId } = params;

    if (!taskId) {
      throw this.createRPCError(-32602, 'Invalid params: taskId required');
    }

    const task = this.tasks.get(taskId);

    if (!task) {
      throw this.createRPCError(-32000, `Task not found: ${taskId}`);
    }

    task.status = {
      state: 'canceled',
      timestamp: new Date().toISOString()
    };

    console.log(`🚫 Task ${taskId} canceled`);

    return task;
  }

  /**
   * Handle REST: Send Message
   */
  private async handleRESTSendMessage(req: Request, res: Response) {
    try {
      const result = await this.handleSendMessage(req.body);
      res.json({ task: result });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle REST: Get task
   */
  private handleRESTGetTask(req: Request, res: Response) {
    const taskId = req.params.taskId;
    const task = this.tasks.get(taskId);

    if (!task) {
      res.status(404).json({ error: `Task not found: ${taskId}` });
      return;
    }

    res.json({ task });
  }

  /**
   * Handle REST: Cancel task
   */
  private handleRESTCancelTask(req: Request, res: Response) {
    const taskId = req.params.taskId;
    const task = this.tasks.get(taskId);

    if (!task) {
      res.status(404).json({ error: `Task not found: ${taskId}` });
      return;
    }

    task.status = {
      state: 'canceled',
      timestamp: new Date().toISOString()
    };

    console.log(`🚫 Task ${taskId} canceled via REST`);
    res.json({ task });
  }

  /**
   * Create JSON-RPC error
   */
  private createRPCError(code: number, message: string, data?: any): JSONRPCError {
    return { code, message, data };
  }

  /**
   * Get Express router
   */
  getRouter(): Router {
    return this.router;
  }
}
