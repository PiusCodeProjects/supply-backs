import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { TrackingService } from './tracking.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'tracking',
})
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  constructor(private trackingService: TrackingService) {}

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinOrder')
  async handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    client.join(`order_${data.orderId}`);
    const latest = await this.trackingService.getLatestLocation(data.orderId);
    if (latest) {
      client.emit('locationUpdated', {
        orderId: data.orderId,
        lat: latest.lat,
        lng: latest.lng,
        timestamp: latest.timestamp,
      });
    }
    return { event: 'joined', data: data.orderId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('updateLocation')
  async handleUpdateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    // 1. Save to DB
    await this.trackingService.updateLocation(data.orderId, data.lat, data.lng);

    // 2. Broadcast to room
    this.server.to(`order_${data.orderId}`).emit('locationUpdated', {
      orderId: data.orderId,
      lat: data.lat,
      lng: data.lng,
      timestamp: new Date(),
    });

    return { status: 'ok' };
  }
}
