import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  ORDER_UPDATED_EVENT,
  type OrderUpdatedPayload,
} from './order-lifecycle.constants';

/**
 * In-process order event bus.
 * Clients without sockets should poll GET /orders/:id every 10s.
 */
@Injectable()
export class OrderEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emitOrderUpdated(payload: OrderUpdatedPayload): void {
    this.logger.debug(
      `${ORDER_UPDATED_EVENT} ${payload.orderId} → ${payload.status}`,
    );
    this.emitter.emit(ORDER_UPDATED_EVENT, payload);
  }

  onOrderUpdated(listener: (payload: OrderUpdatedPayload) => void): () => void {
    this.emitter.on(ORDER_UPDATED_EVENT, listener);
    return () => this.emitter.off(ORDER_UPDATED_EVENT, listener);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
