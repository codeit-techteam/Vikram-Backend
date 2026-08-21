import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { isOriginAllowed, parseCorsOrigins } from '../common/config/cors.util';
import { PrismaService } from '../common/database/prisma.service';
import type { JwtPayload } from '../auth/jwt/jwt-payload.interface';
import {
  ORDER_STATUS_UPDATED_EVENT,
  ORDER_STATUS_UPDATED_EVENT_LEGACY,
  type OrderUpdatedPayload,
} from '../modules/orders/order-lifecycle.constants';

type AuthenticatedSocket = Socket & {
  data: {
    customerId?: string;
  };
};

const wsCorsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
const wsIsProduction = process.env.NODE_ENV === 'production';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: wsIsProduction
      ? wsCorsOrigins
      : (
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void,
        ) => {
          callback(
            null,
            isOriginAllowed(origin, wsCorsOrigins, {
              isProduction: false,
              allowLocalhostInDev: true,
            }),
          );
        },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class OrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`[Socket] rejected ${client.id}: missing token`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      if (payload.type !== 'access' || !payload.sub) {
        this.logger.warn(`[Socket] rejected ${client.id}: invalid token type`);
        client.disconnect(true);
        return;
      }

      const customer = await this.prisma.customer.findFirst({
        where: {
          id: payload.sub,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!customer) {
        this.logger.warn(`[Socket] rejected ${client.id}: customer not found`);
        client.disconnect(true);
        return;
      }

      client.data.customerId = customer.id;
      const room = this.customerRoom(customer.id);
      await client.join(room);
      this.logger.log(
        `[Socket] Customer connected customerId=${customer.id} socket=${client.id} room=${room}`,
      );
      client.emit('connected', {
        customerId: customer.id,
        room,
      });
    } catch (error) {
      this.logger.warn(
        `[Socket] auth failed ${client.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.data.customerId) {
      this.logger.log(
        `[Socket] Customer disconnected customerId=${client.data.customerId} socket=${client.id}`,
      );
    }
  }

  @SubscribeMessage('subscribeOrder')
  async handleSubscribeOrder(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { orderId?: string },
  ): Promise<{ ok: boolean; room?: string }> {
    const customerId = client.data.customerId;
    const orderId = body?.orderId?.trim();
    if (!customerId || !orderId) {
      return { ok: false };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      select: { id: true },
    });

    if (!order) {
      return { ok: false };
    }

    const room = this.orderRoom(orderId);
    await client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('unsubscribeOrder')
  async handleUnsubscribeOrder(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { orderId?: string },
  ): Promise<{ ok: boolean }> {
    const orderId = body?.orderId?.trim();
    if (!orderId) return { ok: false };
    await client.leave(this.orderRoom(orderId));
    return { ok: true };
  }

  /** Called after DB commit — fan-out to customer room only (+ order room). */
  emitOrderStatusUpdated(payload: OrderUpdatedPayload): void {
    const events = [
      ORDER_STATUS_UPDATED_EVENT,
      ORDER_STATUS_UPDATED_EVENT_LEGACY,
    ];

    for (const event of events) {
      if (payload.customerId) {
        this.server
          .to(this.customerRoom(payload.customerId))
          .emit(event, payload);
      }
      this.server.to(this.orderRoom(payload.orderId)).emit(event, payload);
    }

    const roomSizeHint = payload.customerId
      ? this.customerRoom(payload.customerId)
      : this.orderRoom(payload.orderId);

    this.logger.log(
      `[Socket] Emitted ${ORDER_STATUS_UPDATED_EVENT} orderId=${payload.orderId} status=${payload.status} customerId=${payload.customerId ?? 'n/a'} room=${roomSizeHint}`,
    );
  }

  customerRoom(customerId: string): string {
    return `customer:${customerId}`;
  }

  orderRoom(orderId: string): string {
    return `order:${orderId}`;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }
}
