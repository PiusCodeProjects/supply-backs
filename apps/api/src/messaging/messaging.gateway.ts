import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { MessagingService } from './messaging.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'messaging',
})
export class MessagingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private messagingService: MessagingService) {}

  handleConnection(_client: Socket) {}

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user?.sub;
    await this.messagingService.assertParticipant(userId, data.conversationId);
    client.join(`conversation_${data.conversationId}`);
    return { event: 'joined', data: data.conversationId };
  }

  emitNewMessage(conversationId: string, payload: unknown) {
    this.server.to(`conversation_${conversationId}`).emit('messageCreated', payload);
  }

  emitConversationRead(conversationId: string, payload: unknown) {
    this.server.to(`conversation_${conversationId}`).emit('conversationRead', payload);
  }
}
