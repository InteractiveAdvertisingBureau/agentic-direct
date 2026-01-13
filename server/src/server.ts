/**
 * A2A AgenticDirect Server
 * Main entry point - Express server with MCP integration
 */

import 'dotenv/config';
import express from 'express';
import { MCPServer } from './mcp/mcp-server.js';
import { A2ARouter } from './a2a/router.js';
import type { ServerConfig } from './types/index.js';

async function startServer() {
  console.log('🚀 Starting A2A AgenticDirect Server...\n');

  // Load configuration
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    mcpEnableAdminTools: process.env.MCP_ENABLE_ADMIN_TOOLS === 'true'
  };

  if (!config.openaiApiKey) {
    console.error('❌ OPENAI_API_KEY is required');
    process.exit(1);
  }

  // Initialize MCP Server
  const mcpServer = new MCPServer();
  await mcpServer.initialize();

  const tools = mcpServer.getTools();

  console.log(`\n📊 MCP Server initialized with ${tools.length} tools\n`);

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      tools: tools.length
    });
  });

  // MCP HTTP/SSE endpoint
  const mcpTransport = mcpServer.createHttpTransport();
  const mcpServerInstance = mcpServer.getServer();

  mcpServerInstance.connect(mcpTransport).then(() => {
    console.log('✅ MCP HTTP transport connected');
  }).catch((error) => {
    console.error('❌ MCP HTTP transport connection failed:', error);
  });

  app.all('/mcp/sse', async (req, res) => {
    try {
      // For GET requests (SSE streaming), don't pass body
      // For POST requests (message exchange), pass body
      if (req.method === 'GET') {
        await mcpTransport.handleRequest(req, res);
      } else {
        await mcpTransport.handleRequest(req, res, req.body);
      }
    } catch (error) {
      console.error('❌ MCP SSE error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // MCP info endpoint
  app.get('/mcp/info', (req, res) => {
    res.json({
      name: 'A2A AgenticDirect MCP Server',
      version: '1.0.0',
      specification: 'MCP',
      tools: tools.length,
      endpoint: '/mcp/sse',
      toolsList: tools.map(t => t.name)
    });
  });

  // Create A2A routers for buyer and seller agents
  const buyerRouter = new A2ARouter('buyer', mcpServer, tools, config.openaiApiKey);
  const sellerRouter = new A2ARouter('seller', mcpServer, tools, config.openaiApiKey);

  // Mount A2A routers
  app.use('/a2a/buyer', buyerRouter.getRouter());
  app.use('/a2a/seller', sellerRouter.getRouter());

  // Root endpoint - list available agents
  app.get('/', (req, res) => {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${config.port}`;
    const baseUrl = `${protocol}://${host}`;

    res.json({
      name: 'A2A AgenticDirect Server',
      version: '1.0.0',
      protocol: 'A2A v0.3.0',
      agents: [
        {
          role: 'buyer',
          agentCard: `${baseUrl}/a2a/buyer/.well-known/agent-card.json`,
          jsonrpc: `${baseUrl}/a2a/buyer/jsonrpc`
        },
        {
          role: 'seller',
          agentCard: `${baseUrl}/a2a/seller/.well-known/agent-card.json`,
          jsonrpc: `${baseUrl}/a2a/seller/jsonrpc`
        }
      ],
      documentation: 'https://github.com/your-org/a2a-agenticdirect'
    });
  });

  // Error handling
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❌ Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // Start server - bind to 0.0.0.0 for Cloud Run
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${config.port}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   GET  http://localhost:${config.port}/`);
    console.log(`   GET  http://localhost:${config.port}/health`);
    console.log(`   GET  http://localhost:${config.port}/a2a/buyer/.well-known/agent-card.json`);
    console.log(`   POST http://localhost:${config.port}/a2a/buyer/jsonrpc`);
    console.log(`   GET  http://localhost:${config.port}/a2a/seller/.well-known/agent-card.json`);
    console.log(`   POST http://localhost:${config.port}/a2a/seller/jsonrpc`);
    console.log(`\n🎉 Ready to accept A2A requests!\n`);
  });
}

// Start server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
