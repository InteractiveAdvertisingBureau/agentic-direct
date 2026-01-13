/**
 * A2A Agent Card Generator
 * Creates compliant agent cards per A2A Protocol v0.3.0
 */

import type { AgentCard, MCPTool } from '../types/index.js';
import type { Request } from 'express';

export class AgentCardGenerator {
  /**
   * Create agent card with auto-detected URLs
   */
  static createAgentCard(role: 'buyer' | 'seller', tools: MCPTool[], req?: Request): AgentCard {
    // Auto-detect protocol and host from request
    let protocol = 'http';
    let host = 'localhost:3000';

    if (req) {
      // Get protocol from request (handles proxies with X-Forwarded-Proto)
      protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      // Get host from request (handles proxies with X-Forwarded-Host)
      host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    }

    // Allow environment variables to override if needed
    protocol = process.env.PROTOCOL || protocol;
    host = process.env.HOST || host;

    const baseUrl = `${protocol}://${host}`;
    const agentUrl = `${baseUrl}/a2a/${role}`;

    // Define skills based on role
    const skills = role === 'buyer' ? this.getBuyerSkills() : this.getSellerSkills();

    return {
      name: `opendirect-${role}-agent`,
      description: this.getAgentDescription(role),
      protocolVersion: '0.3.0',
      version: '1.0.0',
      url: agentUrl,
      skills,
      capabilities: {
        pushNotifications: false,
        streaming: true,
        mcpIntegration: true
      },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          description: 'OAuth 2.0 authentication for OpenDirect API access',
          flows: {
            clientCredentials: {
              tokenUrl: `${baseUrl}/oauth/token`,
              scopes: {
                'opendirect:read': 'Read access to OpenDirect resources',
                'opendirect:write': 'Write access to OpenDirect resources',
                'opendirect:admin': 'Administrative access to OpenDirect resources'
              }
            },
            authorizationCode: {
              tokenUrl: `${baseUrl}/oauth/token`,
              authorizationUrl: `${baseUrl}/oauth/authorize`,
              scopes: {
                'opendirect:read': 'Read access to OpenDirect resources',
                'opendirect:write': 'Write access to OpenDirect resources',
                'opendirect:admin': 'Administrative access to OpenDirect resources'
              }
            }
          }
        }
      },
      security: [
        {
          oauth2: ['opendirect:read', 'opendirect:write']
        }
      ],
      additionalInterfaces: [
        {
          protocol: 'jsonrpc',
          version: '2.0',
          transport: 'http',
          url: `${agentUrl}/jsonrpc`
        },
        {
          protocol: 'http+json',
          version: '1.0',
          transport: 'http',
          url: `${agentUrl}/rest`
        },
        {
          protocol: 'mcp',
          version: '2024-11-05',
          transport: 'sse',
          tools: tools.map(t => t.name)
        }
      ]
    };
  }

  /**
   * Get buyer agent skills
   */
  private static getBuyerSkills() {
    return [
      {
        id: 'campaign-planning',
        name: 'Campaign Planning',
        description: 'Plan and design advertising campaigns',
        tags: ['advertising', 'campaign', 'planning'],
        examples: [
          'Create a campaign for Nike summer collection',
          'Plan an advertising campaign targeting millennials',
          'Design a Q4 holiday campaign'
        ],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['text/plain', 'application/json']
      },
      {
        id: 'order-creation',
        name: 'Order Creation',
        description: 'Create and manage advertising orders',
        tags: ['advertising', 'order', 'creation'],
        examples: [
          'Create an account for Nike',
          'Create an order for Adidas campaign',
          'Set up a new advertiser account',
          'Create order with budget $50000'
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json']
      },
      {
        id: 'creative-submission',
        name: 'Creative Submission',
        description: 'Submit and manage creative assets',
        tags: ['advertising', 'creative', 'assets'],
        examples: [
          'Submit creative for Nike banner ad',
          'Upload video creative for campaign',
          'Create display ad creative'
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json']
      },
      {
        id: 'product-discovery',
        name: 'Product Discovery',
        description: 'Search and discover advertising products',
        tags: ['advertising', 'product', 'search'],
        examples: [
          'Find premium advertising products',
          'Search for video ad inventory',
          'List available ad products'
        ],
        inputModes: ['text/plain'],
        outputModes: ['application/json']
      }
    ];
  }

  /**
   * Get seller agent skills
   */
  private static getSellerSkills() {
    return [
      {
        id: 'product-search',
        name: 'Product Search',
        description: 'Search available advertising inventory',
        tags: ['advertising', 'inventory', 'search'],
        examples: [
          'List available products',
          'Search for premium ad space',
          'Find video ad inventory'
        ],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['application/json']
      },
      {
        id: 'inventory-management',
        name: 'Inventory Management',
        description: 'Manage advertising inventory and products',
        tags: ['advertising', 'inventory', 'management'],
        examples: [
          'Create new ad product',
          'Update product availability',
          'Manage inventory pricing'
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json']
      },
      {
        id: 'order-processing',
        name: 'Order Processing',
        description: 'Process and fulfill advertising orders',
        tags: ['advertising', 'order', 'fulfillment'],
        examples: [
          'Process order for account ABC',
          'Approve pending order',
          'Update order status'
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json']
      },
      {
        id: 'creative-approval',
        name: 'Creative Approval',
        description: 'Review and approve creative submissions',
        tags: ['advertising', 'creative', 'approval'],
        examples: [
          'Review creative submission',
          'Approve banner ad creative',
          'Reject creative with feedback'
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json']
      }
    ];
  }

  /**
   * Get agent description
   */
  private static getAgentDescription(role: 'buyer' | 'seller'): string {
    return role === 'buyer'
      ? 'Use this agent for ALL advertising-related requests including: creating accounts, managing campaigns, creating orders, submitting creatives, and searching for advertising products. Handles advertiser (buyer) operations using OpenDirect v2.1 standard.'
      : 'Use this agent for ALL publisher-related requests including: searching inventory, managing products, processing orders, and approving creatives. Handles publisher (seller) operations using OpenDirect v2.1 standard.';
  }
}
