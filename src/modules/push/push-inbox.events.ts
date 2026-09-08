import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

export const NOTIFICATION_INBOX_CREATED_EVENT = 'notification.inbox.created';

export interface NotificationInboxCreatedPayload {
  campaignId: string;
  customerIds: string[];
}

@Injectable()
export class PushInboxEventsService implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emitInboxCreated(payload: NotificationInboxCreatedPayload): void {
    this.emitter.emit(NOTIFICATION_INBOX_CREATED_EVENT, payload);
  }

  onInboxCreated(
    listener: (payload: NotificationInboxCreatedPayload) => void,
  ): () => void {
    this.emitter.on(NOTIFICATION_INBOX_CREATED_EVENT, listener);
    return () => this.emitter.off(NOTIFICATION_INBOX_CREATED_EVENT, listener);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
