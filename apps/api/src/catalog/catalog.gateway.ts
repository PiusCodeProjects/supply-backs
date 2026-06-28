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

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'catalog',
})
export class CatalogGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinSupplierRoom')
  handleJoinSupplierRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { supplierId: string },
  ) {
    client.join(`supplier_${data.supplierId}`);
    return { event: 'joined', data: data.supplierId };
  }

  emitStockUpdated(supplierId: string, updates: { id: string; stock: number }[]) {
    this.server.to(`supplier_${supplierId}`).emit('stockUpdated', updates);
  }

  emitGlobalStockUpdated(updates: { id: string; stock: number }[]) {
    this.server.emit('stockUpdated', updates);
  }

  emitCatalogChanged(payload: { action: 'created' | 'updated' | 'deleted'; itemId: string }) {
    this.server.emit('catalogChanged', payload);
  }
}
