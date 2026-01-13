/**
 * A2A Express Router
 * Uses @a2a-js/sdk DefaultRequestHandler and JsonRpcTransportHandler
 * for full A2A v0.3.0 compliance
 */

import { Router, type Request, type Response } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager
} from '@a2a-js/sdk/server';
import { AgentCardGenerator } from './agent-card.js';
import { AgentExecutor } from './executor.js';
import type { MCPServer } from '../mcp/mcp-server.js';
import type { MCPTool } from '../types/index.js';

export class A2ARouter {
  private router: Router;
  private role: 'buyer' | 'seller';
  private mcpServer: MCPServer;
  private tools: MCPTool[];
  private openaiApiKey: string;
  private requestHandler!: DefaultRequestHandler;
  private jsonRpcHandler!: JsonRpcTransportHandler;

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

    // Initialize SDK components
    this.initializeSDKComponents();
    this.setupRoutes();
  }

  /**
   * Initialize @a2a-js/sdk components
   */
  private initializeSDKComponents() {
    // Generate agent card
    const agentCard = AgentCardGenerator.createAgentCard(this.role, this.tools);

    // Create task store
    const taskStore = new InMemoryTaskStore();

    // Create agent executor
    const agentExecutor = new AgentExecutor(
      this.role,
      this.mcpServer,
      this.tools,
      this.openaiApiKey
    );

    // Create event bus manager
    const eventBusManager = new DefaultExecutionEventBusManager();

    // Create request handler (SDK's default handler)
    this.requestHandler = new DefaultRequestHandler(
      agentCard,
      taskStore,
      agentExecutor,
      eventBusManager
    );

    // Create JSON-RPC transport handler
    this.jsonRpcHandler = new JsonRpcTransportHandler(this.requestHandler);

    console.log(`✅ SDK components initialized for ${this.role} agent`);
  }

  /**
   * Setup Express routes using SDK handlers
   */
  private setupRoutes() {
    // Agent card discovery (A2A standard)
    this.router.get(`/${AGENT_CARD_PATH}`, async (req, res) => {
      try {
        const agentCard = await this.requestHandler.getAgentCard();
        res.json(agentCard);
      } catch (error) {
        console.error('Error getting agent card:', error);
        res.status(500).json({ error: 'Failed to get agent card' });
      }
    });

    // Legacy /card endpoint for backwards compatibility
    this.router.get('/card', async (req, res) => {
      try {
        const agentCard = await this.requestHandler.getAgentCard();
        res.json(agentCard);
      } catch (error) {
        console.error('Error getting agent card:', error);
        res.status(500).json({ error: 'Failed to get agent card' });
      }
    });

    // Default endpoint at root - JSON-RPC (A2A v0.3.0 standard)
    this.router.post('/', async (req, res) => {
      await this.handleJSONRPC(req, res);
    });

    // JSON-RPC 2.0 endpoint
    this.router.post('/jsonrpc', async (req, res) => {
      await this.handleJSONRPC(req, res);
    });
  }

  /**
   * Handle JSON-RPC 2.0 requests using SDK handler
   */
  private async handleJSONRPC(req: Request, res: Response) {
    try {
      console.log(`📥 JSON-RPC request: method="${req.body?.method}"`);

      // Use SDK's JsonRpcTransportHandler
      const result = await this.jsonRpcHandler.handle(req.body);

      // Check if it's a streaming response (AsyncGenerator)
      if (result && typeof (result as any)[Symbol.asyncIterator] === 'function') {
        // Handle streaming response (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const event of result as AsyncGenerator) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        res.end();
      } else {
        // Handle single response
        res.json(result);
      }
    } catch (error) {
      console.error('❌ JSON-RPC error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        },
        id: req.body?.id || null
      });
    }
  }

  /**
   * Get Express router
   */
  getRouter(): Router {
    return this.router;
  }
}
