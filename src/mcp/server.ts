import { Request, Response } from 'express';
import { tools, executeToolCall } from './tools.js';
import { MCPToolCall } from '../oura/types.js';

/**
 * Handles SSE endpoint for MCP connection
 */
export function handleSSE(req: Request, res: Response): void {
  console.log('[MCP] SSE connection established');

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  // Send endpoint event
  res.write('event: endpoint\n');
  res.write('data: /message\n\n');

  // Send initialization message with protocol version and capabilities
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '0.1.0',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'oura-mcp-server',
        version: '1.0.0',
      },
    },
  };

  res.write('event: message\n');
  res.write(`data: ${JSON.stringify(initMessage)}\n\n`);

  // Keep connection alive with periodic pings
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  // Clean up on close
  req.on('close', () => {
    clearInterval(pingInterval);
    console.log('[MCP] SSE connection closed');
  });
}

/**
 * Handles MCP message endpoint (tool calls)
 */
export async function handleMessage(req: Request, res: Response): Promise<void> {
  const { jsonrpc, id, method, params } = req.body;

  console.log('[MCP] Received message:', { method, params });

  // Validate JSON-RPC format
  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32600,
        message: 'Invalid request',
        data: {
          details: 'Invalid JSON-RPC version',
        },
      },
    });
    return;
  }

  try {
    let result: any;

    switch (method) {
      case 'initialize':
        result = await handleInitialize();
        break;

      case 'tools/list':
        result = await handleToolsList();
        break;

      case 'tools/call':
        result = await handleToolsCall(params);
        break;

      default:
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: {
              details: `Unknown method: ${method}`,
            },
          },
        });
        return;
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result,
    });
  } catch (error) {
    console.error('[MCP] Error handling message:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = errorMessage.includes('authenticate') ? -32000 : -32603;

    res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: errorCode,
        message: errorMessage,
        data: {
          details: errorMessage,
        },
      },
    });
  }
}

/**
 * Handles initialize request
 */
async function handleInitialize(): Promise<any> {
  return {
    protocolVersion: '0.1.0',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: 'oura-mcp-server',
      version: '1.0.0',
    },
  };
}

/**
 * Handles tools/list request
 */
async function handleToolsList(): Promise<any> {
  return {
    tools,
  };
}

/**
 * Handles tools/call request
 */
async function handleToolsCall(params: any): Promise<any> {
  if (!params || !params.name) {
    throw new Error('Missing tool name in params');
  }

  const toolCall: MCPToolCall = {
    name: params.name,
    arguments: params.arguments || {},
  };

  const result = await executeToolCall(toolCall);
  return result;
}
