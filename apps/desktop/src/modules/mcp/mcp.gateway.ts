import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class McpGateway {
  @WebSocketServer()
  server!: Server;

  // TODO: Implement MCP WebSocket handlers
}
