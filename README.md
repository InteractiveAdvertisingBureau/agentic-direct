# A2A AgenticDirect

Clean, schema-driven implementation of A2A (Agent-to-Agent) protocol with MCP (Model Context Protocol) integration for OpenDirect v2.1.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      opendirect.json                             │
│                   (OpenAPI 3.0 Schema)                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Parsed by SchemaParser
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                            │
│  • Auto-generates tools from schema                             │
│  • Handles tool execution                                       │
│  • Returns mock responses                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Provides tool handlers
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      A2A Agent Layer                             │
│  • Agent Card Generator (v0.3.0)                                │
│  • JSON-RPC 2.0 Router                                          │
│  • Agent Executor (OpenAI-powered)                              │
│  • Task Management                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTP/JSON-RPC
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JavaScript Client                             │
│  • @a2a-js/sdk integration                                      │
│  • Agent discovery                                              │
│  • Message sending                                              │
│  • Task polling                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Server (TypeScript)

- **Schema-Driven**: Automatically generates MCP tools from OpenAPI spec
- **A2A v0.3.0 Compliant**: Full agent card with skills, OAuth2, interfaces
- **AI-Powered Execution**: Uses OpenAI GPT-4o-mini for tool selection
- **Dual Agents**: Separate buyer and seller agents with role-specific skills
- **JSON-RPC 2.0**: Standard protocol for agent communication
- **Dynamic URLs**: Auto-detects URLs from request headers (Cloud Run ready)
- **Task Management**: Full task lifecycle (pending → working → completed/failed)

### Client (JavaScript)

- **@a2a-js/sdk**: Official A2A SDK integration
- **Agent Discovery**: Automatic agent card fetching
- **Real-time Updates**: Task polling for response updates
- **Quick Actions**: Pre-built message templates
- **Clean UI**: Modern, responsive interface

## Project Structure

```
a2a-agenticdirect/
├── server/                    # TypeScript server
│   ├── src/
│   │   ├── types/
│   │   │   └── index.ts      # Type definitions
│   │   ├── mcp/
│   │   │   ├── schema-parser.ts   # OpenAPI → MCP tools
│   │   │   └── mcp-server.ts      # MCP protocol handler
│   │   ├── a2a/
│   │   │   ├── agent-card.ts      # Agent card generator
│   │   │   ├── executor.ts        # AI-powered execution
│   │   │   └── router.ts          # Express routes
│   │   └── server.ts         # Main entry point
│   ├── package.json
│   └── tsconfig.json
├── client/                    # JavaScript client
│   ├── src/
│   │   └── app.js            # A2A SDK ClientFactory implementation
│   ├── dist/
│   │   └── bundle.js         # Bundled client (generated)
│   ├── index.html
│   ├── style.css
│   └── package.json
├── opendirect.json           # OpenAPI schema
└── README.md
```

## Setup

### Prerequisites

- Node.js 20+
- OpenAI API key

### Server Setup

1. Navigate to server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Add your OpenAI API key to `.env`:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

5. Build and start:
```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm start
```

Server will start on http://localhost:3000

### Client Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Build and run:
```bash
# Development mode (with hot reload and bundling)
npm run dev

# Or build once and serve
npm run build
npm run serve
```

Client will be available at http://localhost:8080

**Note:** The client uses esbuild to bundle `@a2a-js/sdk` into `dist/bundle.js`. Always run `npm run dev` or `npm run build` before accessing the client.

## Usage

### Using the Web Client

1. Open http://localhost:8080 in your browser
2. Configure:
   - Server URL: `http://localhost:3000`
   - Agent Role: `buyer` or `seller`
3. Click **Connect to Agent**
4. Send messages using quick actions or custom text

**Example messages for Buyer Agent:**
- "Create an account for Nike"
- "Create an order for Adidas campaign"
- "Submit creative for Nike banner ad"
- "List available products"

**Example messages for Seller Agent:**
- "List available products"
- "Process order for account ABC"
- "Approve creative submission"

### Using curl (JSON-RPC)

#### Get Agent Card
```bash
curl http://localhost:3000/a2a/buyer/.well-known/agent-card.json
```

#### Send Message
```bash
curl -X POST http://localhost:3000/a2a/buyer/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "sendMessage",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "Create an account for Nike"}],
        "kind": "message"
      }
    },
    "id": 1
  }'
```

Response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "id": "task-uuid",
    "status": {
      "state": "working",
      "timestamp": "2025-01-02T..."
    }
  },
  "id": 1
}
```

#### Get Task Status
```bash
curl -X POST http://localhost:3000/a2a/buyer/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "getTask",
    "params": {
      "taskId": "task-uuid"
    },
    "id": 2
  }'
```

## API Reference

### Endpoints

#### `GET /`
Server information and available agents

#### `GET /health`
Health check endpoint

#### `GET /a2a/{role}/.well-known/agent-card.json`
Agent card discovery (A2A v0.3.0)

#### `POST /a2a/{role}/jsonrpc`
JSON-RPC 2.0 endpoint for agent communication

**Methods:**
- `sendMessage` - Send message to agent
- `getTask` - Get task status
- `cancelTask` - Cancel task

### Agent Card Schema

```json
{
  "name": "opendirect-buyer-agent",
  "protocolVersion": "0.3.0",
  "version": "1.0.0",
  "url": "http://localhost:3000/a2a/buyer",
  "description": "...",
  "skills": [
    {
      "id": "order-creation",
      "name": "Order Creation",
      "description": "Create and manage advertising orders",
      "tags": ["advertising", "order"],
      "examples": [
        "Create an account for Nike",
        "Create an order for Adidas campaign"
      ],
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ],
  "capabilities": {
    "pushNotifications": false,
    "streaming": true,
    "mcpIntegration": true
  },
  "securitySchemes": {
    "oauth2": {
      "type": "oauth2",
      "flows": {
        "clientCredentials": {...},
        "authorizationCode": {...}
      }
    }
  },
  "additionalInterfaces": [
    {
      "protocol": "jsonrpc",
      "version": "2.0",
      "transport": "http",
      "url": "http://localhost:3000/a2a/buyer/jsonrpc"
    },
    {
      "protocol": "mcp",
      "version": "2024-11-05",
      "transport": "sse",
      "tools": ["create_account", "create_order", ...]
    }
  ]
}
```

## How It Works

### 1. Schema Parsing
`SchemaParser` reads `opendirect.json` (OpenAPI 3.0 spec) and extracts:
- **Operations** → MCP tool names (e.g., `create_account`)
- **Parameters** → Input schemas
- **Request bodies** → Additional parameters

### 2. MCP Tool Generation
`MCPServer` creates tool handlers for each operation:
- Validates input against schema
- Executes tool (currently returns mock data)
- Returns structured response

### 3. A2A Agent Layer
`AgentCardGenerator` creates compliant agent cards with:
- Dynamic URL detection (X-Forwarded-* headers)
- Role-specific skills with examples
- OAuth2 security schemes
- MCP integration metadata

### 4. AI-Powered Execution
`AgentExecutor` uses OpenAI to:
- Analyze user message
- Select appropriate tool
- Extract parameters
- Execute and respond

### 5. Task Management
`A2ARouter` handles:
- Message reception
- Task creation and tracking
- Asynchronous execution
- Status polling

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `PROTOCOL` | No | Auto-detect | Override protocol (http/https) |
| `HOST` | No | Auto-detect | Override host |

## Development

### Build Server
```bash
cd server
npm run build
```

### Watch Mode
```bash
cd server
npm run dev
```

### Add New Tools
Tools are automatically generated from `opendirect.json`. To add new tools:

1. Update `opendirect.json` with new operations
2. Restart server - tools auto-refresh

### Customize Tool Handlers
Edit `server/src/mcp/mcp-server.ts`:

```typescript
private createToolHandler(tool: MCPTool): MCPToolHandler {
  return async (params: any) => {
    // Add custom logic here
    if (tool.name === 'create_account') {
      // Call actual API
      return await yourAPI.createAccount(params);
    }

    // Default mock response
    return this.generateMockResponse(tool.name, params);
  };
}
```

## Testing

### Test Agent Card
```bash
curl http://localhost:3000/a2a/buyer/.well-known/agent-card.json | jq
```

### Test Message Flow
```bash
# 1. Send message
TASK_ID=$(curl -X POST http://localhost:3000/a2a/buyer/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "sendMessage",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "Create an account for Nike"}],
        "kind": "message"
      }
    },
    "id": 1
  }' | jq -r '.result.id')

# 2. Check task status
curl -X POST http://localhost:3000/a2a/buyer/jsonrpc \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"getTask\",
    \"params\": {
      \"taskId\": \"$TASK_ID\"
    },
    \"id\": 2
  }" | jq
```

## Troubleshooting

### "No response from AI"
- Check OpenAI API key is valid
- Verify API quota not exceeded
- Check network connectivity

### "Tool not found"
- Restart server to refresh tools from schema
- Verify `opendirect.json` contains operation

### Task stuck in "working"
- Check server logs for errors
- Verify OpenAI API is responding
- Check for rate limiting

### Agent card shows localhost in production
- Ensure reverse proxy sets `X-Forwarded-Proto` and `X-Forwarded-Host`
- Or set `PROTOCOL` and `HOST` environment variables

## Credits

- Built with [A2A Protocol v0.3.0](https://a2a.dev)
- Uses [@a2a-js/sdk](https://www.npmjs.com/package/@a2a-js/sdk)
- Implements [MCP (Model Context Protocol)](https://modelcontextprotocol.io)
- Based on [OpenDirect v2.1](https://iabtechlab.com/opendirect)
