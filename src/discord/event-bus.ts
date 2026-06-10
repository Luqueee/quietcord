import {EventEmitter} from 'node:events';
import type {GatewayEvent, GatewayEventPayload} from '../domain/events.js';
import {log} from '../infra/log.js';

type Listener<E extends GatewayEvent> = (payload: GatewayEventPayload<E>) => void;

export class TypedEmitter {
  private ee = new EventEmitter();

  on<E extends GatewayEvent>(event: E, listener: Listener<E>): this {
    this.ee.on(event, listener);
    return this;
  }

  off<E extends GatewayEvent>(event: E, listener: Listener<E>): this {
    this.ee.off(event, listener);
    return this;
  }

  emit<E extends GatewayEvent>(event: E, payload: GatewayEventPayload<E>): boolean {
    return this.ee.emit(event, payload);
  }

  removeAllListeners(): void {
    this.ee.removeAllListeners();
  }
}

export {log};
