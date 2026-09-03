import { Injectable, Optional } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * The one call sites use: `realtime.emit(propertyId, 'reservation.changed',
 * { id })`. Events name the thing that changed, not what to do about it —
 * the app decides which screens to refresh. The catalogue of events:
 *
 *   reservation.changed  { id, status }        booking created / moved / status
 *   room.status          { id, status }        housekeeping / desk flipped a room
 *   order.changed        { id, status }        POS order, KOT fired, settled
 *   task.changed         { id, status }        housekeeping task moved
 *   rates.changed        { roomTypeIds }       grid edited or rules ran
 *   message.received     { conversationId }    a guest wrote in
 */
@Injectable()
export class RealtimeService {
  constructor(@Optional() private readonly gateway?: RealtimeGateway) {}

  emit(propertyId: string, event: string, payload: Record<string, unknown> = {}): void {
    try {
      this.gateway?.emit(propertyId, event, payload);
    } catch {
      /* a broadcast must never fail a write */
    }
  }
}
