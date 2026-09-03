import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

const STAFF_ISSUER = 'tavelo-staff';
const STAFF_AUDIENCE = 'tavelo-staff';

/**
 * Live updates for the staff app.
 *
 * A socket authenticates with the same staff access token the REST API takes
 * (`auth.token` on connect), verified against the staff secret/issuer/audience
 * so an owner or admin token can never join. Once in, it is placed in the
 * room for ITS property and nothing else — every emit is property-scoped, so
 * a client can only ever hear about its own hotel. The server never trusts a
 * client-supplied property id.
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth?.token as string | undefined) ?? '';
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; propertyId: string }>(token, {
        secret: this.config.getOrThrow<string>('STAFF_JWT_ACCESS_SECRET'),
        issuer: STAFF_ISSUER,
        audience: STAFF_AUDIENCE,
      });
      if (!payload.propertyId) throw new Error('no property');
      await client.join(RealtimeGateway.room(payload.propertyId));
      client.data.propertyId = payload.propertyId;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    /* nothing to release — rooms are dropped with the socket */
  }

  static room(propertyId: string): string {
    return `property:${propertyId}`;
  }

  /** Broadcast to everyone at one property. */
  emit(propertyId: string, event: string, payload: Record<string, unknown>): void {
    if (!this.server) return;
    this.server
      .to(RealtimeGateway.room(propertyId))
      .emit(event, { ...payload, at: new Date().toISOString() });
  }
}
