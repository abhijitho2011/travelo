import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class IssueKeyCardDto {
  @IsUUID() reservationId!: string;
}

export class DeactivateKeyCardDto {
  /** true records the card as LOST (a security event), not merely dead. */
  @IsOptional() @IsBoolean() lost?: boolean;
}
