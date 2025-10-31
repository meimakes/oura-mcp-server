import { Request, Response } from 'express';
import crypto from 'crypto';
import { tools, executeToolCall } from './tools.js';
import { MCPToolCall } from '../oura/types.js';
import { logger } from '../utils/logger.js';

// Store active SSE connections by session ID
const sseConnections = new Map<string, Response>();

/**
 * Handles SSE endpoint for MCP connection
 */
export async function handleSSE(req: Request, res: Response): Promise<void> {
  logger.debug(`Request to /sse via ${req.method}`);

  // Check if this is a JSON-RPC request (Streamable HTTP)
  if (req.method === 'POST' && req.body && req.body.jsonrpc) {
    logger.debug('Handling as Streamable HTTP JSON-RPC request');
    // This is a JSON-RPC request, handle it like a message
    await handleStreamableHTTPMessage(req, res);
    return;
  }

  // This is an SSE connection request
  // Generate unique session ID
  const sessionId = crypto.randomBytes(16).toString('hex');

  logger.info(`SSE connection established: ${sessionId}`);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  // Ensure CORS headers are set
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Explicitly set status and flush headers
  res.status(200);
  res.flushHeaders();

  // Store SSE connection for this session
  sseConnections.set(sessionId, res);

  // Send endpoint event with session ID
  const endpointData = `/message?sessionId=${sessionId}`;

  res.write('event: endpoint\n');
  res.write(`data: ${endpointData}\n\n`);

  // Force flush the data
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  // Keep connection alive with periodic pings (every 15 seconds)
  const pingInterval = setInterval(() => {
    try {
      if (!res.writableEnded) {
        res.write(`: ping ${Date.now()}\n\n`);
      } else {
        clearInterval(pingInterval);
        sseConnections.delete(sessionId);
      }
    } catch (error) {
      logger.error(`Error sending ping for session ${sessionId}:`, error);
      clearInterval(pingInterval);
      sseConnections.delete(sessionId);
    }
  }, 15000);

  // Clean up on close
  req.on('close', () => {
    logger.debug(`Client closed connection: ${sessionId}`);
    clearInterval(pingInterval);
    sseConnections.delete(sessionId);
  });

  req.on('error', (error) => {
    logger.error(`Connection error for session ${sessionId}:`, error);
    clearInterval(pingInterval);
    sseConnections.delete(sessionId);
  });

  res.on('error', (error) => {
    logger.error(`Response error for session ${sessionId}:`, error);
    clearInterval(pingInterval);
    sseConnections.delete(sessionId);
  });

  res.on('finish', () => {
    logger.debug(`Connection closed: ${sessionId}`);
    clearInterval(pingInterval);
    sseConnections.delete(sessionId);
  });
}

/**
 * Handles Streamable HTTP JSON-RPC requests to /sse
 */
async function handleStreamableHTTPMessage(req: Request, res: Response): Promise<void> {
  const { jsonrpc, id, method, params } = req.body;

  logger.info(`Streamable HTTP: ${method}`);
  logger.debug('Request:', JSON.stringify({ jsonrpc, id, method, params }, null, 2));

  // Validate JSON-RPC format
  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32600,
        message: 'Invalid request',
        data: { details: 'Invalid JSON-RPC version' },
      },
    });
    return;
  }

  // Handle notifications (no id field) - they don't get responses
  if (id === undefined || id === null) {
    logger.debug(`Notification: ${method}`);

    // Process known notifications
    if (method === 'notifications/initialized') {
      res.status(204).end(); // No Content
      return;
    }

    // Unknown notification - just acknowledge it
    res.status(204).end();
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
            data: { details: `Unknown method: ${method}` },
          },
        });
        return;
    }

    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };

    logger.debug('Response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    logger.error('Error in Streamable HTTP:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: errorMessage,
        data: { details: errorMessage },
      },
    });
  }
}

/**
 * Handles MCP message endpoint (tool calls)
 */
export async function handleMessage(req: Request, res: Response): Promise<void> {
  const sessionId = req.query.sessionId;
  const { jsonrpc, id, method, params } = req.body;

  logger.info(`MCP: ${method} (session: ${sessionId})`);
  logger.debug('Request:', JSON.stringify({ jsonrpc, id, method, params }, null, 2));

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

  // Handle notifications (no id field) - they don't get responses
  if (id === undefined || id === null) {
    logger.debug(`Notification: ${method}`);

    // Process known notifications
    if (method === 'notifications/initialized') {
      res.status(202).end(); // Accepted
      return;
    }

    // Unknown notification - just acknowledge it
    res.status(202).end();
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

    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };

    logger.debug('Response:', JSON.stringify(response, null, 2));

    // Send response via SSE stream
    if (sessionId && typeof sessionId === 'string') {
      const sseConnection = sseConnections.get(sessionId);
      if (sseConnection) {
        sseConnection.write('event: message\n');
        sseConnection.write(`data: ${JSON.stringify(response)}\n\n`);
        // Return 202 Accepted to the POST request
        res.status(202).end();
      } else {
        logger.warn(`No SSE connection found for session: ${sessionId}`);
        // Fallback: send via HTTP response
        res.json(response);
      }
    } else {
      // No session ID, send via HTTP response
      res.json(response);
    }
  } catch (error) {
    logger.error('Error handling message:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = errorMessage.includes('authenticate') ? -32000 : -32603;

    const errorResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code: errorCode,
        message: errorMessage,
        data: {
          details: errorMessage,
        },
      },
    };

    // Send error via SSE stream if possible
    if (sessionId && typeof sessionId === 'string') {
      const sseConnection = sseConnections.get(sessionId);
      if (sseConnection) {
        sseConnection.write('event: message\n');
        sseConnection.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.status(202).end();
        return;
      }
    }

    // Fallback: send via HTTP response
    res.status(500).json(errorResponse);
  }
}

/**
 * Handles initialize request
 */
async function handleInitialize(): Promise<any> {
  return {
    protocolVersion: '2025-06-18',
    capabilities: {
      tools: {
        listChanged: false,
      },
      resources: {},
      prompts: {},
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
