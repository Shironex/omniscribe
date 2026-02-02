import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GitGateway {
  @WebSocketServer()
  server!: Server;

  // TODO: Implement git WebSocket handlers
}
