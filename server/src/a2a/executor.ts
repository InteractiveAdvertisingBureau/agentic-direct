/**
 * Agent Executor
 * AI-powered execution engine that selects and executes MCP tools
 * Implements @a2a-js/sdk AgentExecutor interface
 */

import OpenAI from 'openai';
import type { AgentExecutor as IAgentExecutor, RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Message } from '@a2a-js/sdk';
import type { MCPServer } from '../mcp/mcp-server.js';
import type { MCPTool } from '../types/index.js';

export class AgentExecutor implements IAgentExecutor {
  private openai: OpenAI;
  private mcpServer: MCPServer;
  private tools: MCPTool[];
  private role: 'buyer' | 'seller';
  private activeTasks: Set<string> = new Set();

  constructor(
    role: 'buyer' | 'seller',
    mcpServer: MCPServer,
    tools: MCPTool[],
    openaiApiKey: string
  ) {
    this.role = role;
    this.mcpServer = mcpServer;
    this.tools = tools;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  /**
   * Execute user request (SDK AgentExecutor interface)
   */
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId } = requestContext;
    const userText = this.extractTextFromMessage(userMessage);

    console.log(`🤖 Agent Executor (${this.role}): Processing request`);
    console.log(`📝 User message: ${userText}`);

    // Mark task as active
    this.activeTasks.add(taskId);

    try {
      // Step 1: Select appropriate tools using AI
      const planResponse = await this.selectToolWithAI(userText);

      // Check if multi-step or single-step
      const steps = planResponse.steps || [{ toolName: planResponse.toolName, toolParams: planResponse.toolParams }];

      console.log(`📊 Execution plan: ${steps.length} step(s)`);

      const results: any[] = [];
      let previousResult: any = null;

      // Execute each step sequentially
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`\n🔧 Step ${i + 1}/${steps.length}: ${step.toolName}`);

        // Replace placeholders with actual results from previous steps
        let params = { ...step.toolParams };
        if (previousResult && previousResult.id) {
          // Replace "__PREVIOUS_RESULT_ID__" placeholder with actual ID
          for (const key in params) {
            if (params[key] === '__PREVIOUS_RESULT_ID__') {
              params[key] = previousResult.id;
              console.log(`🔗 Linked ${key} to previous result ID: ${previousResult.id}`);
            }
          }
        }

        console.log(`📋 Parameters:`, JSON.stringify(params, null, 2));

        // Execute the tool
        const result = await this.executeTool(step.toolName, params);
        results.push({ tool: step.toolName, result });
        previousResult = result;

        console.log(`✅ Step ${i + 1} completed`);

        // Publish intermediate result for multi-step
        if (steps.length > 1) {
          const stepMessage = this.createAgentMessage(
            `Step ${i + 1}/${steps.length}: Successfully executed ${step.toolName}`,
            result,
            contextId,
            taskId
          );
          eventBus.publish(stepMessage);
        }
      }

      console.log(`\n✅ All ${steps.length} step(s) completed successfully`);

      // Step 3: Publish final summary
      const summary = steps.length > 1
        ? `Successfully completed ${steps.length} steps:\n${steps.map((s: any, i: number) => `${i + 1}. ${s.toolName}`).join('\n')}`
        : `Successfully executed ${steps[0].toolName}`;

      const finalMessage = this.createAgentMessage(
        summary,
        steps.length === 1 ? results[0].result : results,
        contextId,
        taskId
      );

      eventBus.publish(finalMessage);
      eventBus.finished();

    } catch (error) {
      console.error(`❌ Execution failed:`, error);

      // Publish error message
      const errorMessage = this.createAgentMessage(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        null,
        contextId,
        taskId
      );

      eventBus.publish(errorMessage);
      eventBus.finished();
    } finally {
      // Remove from active tasks
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Cancel a running task (SDK AgentExecutor interface)
   */
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    console.log(`🚫 Canceling task: ${taskId}`);

    if (!this.activeTasks.has(taskId)) {
      console.warn(`Task ${taskId} not found in active tasks`);
      return;
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Publish cancellation event
    const cancelMessage = this.createAgentMessage(
      'Task has been canceled',
      null,
      '', // contextId will be set by SDK
      taskId
    );

    eventBus.publish(cancelMessage);
    eventBus.finished();
  }

  /**
   * Select tool using OpenAI
   */
  private async selectToolWithAI(userMessage: string): Promise<{ toolName: string; toolParams: any; steps?: Array<{ toolName: string; toolParams: any }> }> {
    const toolsWithSchemas = this.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema.properties || {}
    }));

    const systemPrompt = `You are an AI assistant for the OpenDirect ${this.role} agent.
Your job is to analyze user requests and determine which tools to execute.

Available tools with their exact parameter names:
${toolsWithSchemas.map(t => `
- ${t.name}: ${t.description}
  Parameters: ${JSON.stringify(t.parameters, null, 2)}
`).join('\n')}

IMPORTANT RULES:
1. Use the EXACT parameter names from the tool schemas above
2. Use entity names EXACTLY as provided by the user (do NOT add suffixes like "Account" or "Order")
3. For multi-step workflows that need results from previous steps, use the special placeholder: "__PREVIOUS_RESULT_ID__"
4. You must respond with a valid JSON object

Example for "create account for Nike and create order for Nike with budget 500":
{
  "steps": [
    {
      "toolName": "create_account",
      "toolParams": { "name": "Nike", "type": "advertiser" }
    },
    {
      "toolName": "create_order",
      "toolParams": { "accountId": "__PREVIOUS_RESULT_ID__", "name": "Nike", "budget": 500 }
    }
  ]
}

If the request requires only ONE tool, respond with this JSON format:
{
  "toolName": "the_tool_to_use",
  "toolParams": { "paramName": "value" }
}

Always return valid JSON.`;

    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    return JSON.parse(content);
  }

  /**
   * Execute a tool using MCP protocol
   */
  private async executeTool(toolName: string, params: any): Promise<any> {
    console.log(`🔌 Calling MCP tool via protocol: ${toolName}`);

    try {
      // Execute through MCP server using protocol-compliant call
      const response = await this.mcpServer.callTool(toolName, params);

      // Extract result from MCP response
      if (response.content && response.content.length > 0) {
        const textContent = response.content[0];
        if (textContent.type === 'text') {
          // Try to parse JSON response
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }

      return response;
    } catch (error) {
      console.error(`❌ MCP tool execution failed:`, error);
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text from message (SDK Message type)
   */
  private extractTextFromMessage(message: Message): string {
    const textParts = message.parts.filter((p: any) => p.kind === 'text');
    return textParts.map((p: any) => p.text).join(' ');
  }

  /**
   * Create agent message (SDK Message type)
   */
  private createAgentMessage(
    text: string,
    data: any,
    contextId: string,
    taskId: string
  ): Message {
    const parts: any[] = [
      { kind: 'text', text }
    ];

    if (data) {
      parts.push({ kind: 'data', data });
    }

    return {
      kind: 'message',
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      role: 'agent',
      parts,
      contextId,
      taskId
    } as Message;
  }
}
