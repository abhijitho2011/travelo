import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { AuditService } from '../audit/audit.service';
import { AmenitiesService } from './amenities.service';
import { RoomTypesService } from './room-types.service';
import { RoomsService } from './rooms.service';
import { RoomPhotosService } from './room-photos.service';
import {
  MAX_PHOTO_BYTES,
  RoomTypePhotosService,
  type UploadedRoomTypePhoto,
} from './room-type-photos.service';
import {
  BulkRoomStatusDto,
  BulkCreateRoomsDto,
  CreateRoomDto,
  ReorderRoomTypePhotosDto,
  RoomFilterDto,
  RoomTypeFilterDto,
  RoomTypeInputDto,
  SetRoomStatusDto,
  UpdateRoomDto,
  UpdateRoomTypeDto,
  UploadRoomTypePhotoDto,
} from './dto';

/**
 * Room types, per property. GM/AGM own these; nobody else writes them.
 *
 * Every route resolves rows by (id, the CALLER'S OWN propertyId) — the property
 * is never a parameter a client supplies, so there is no cross-property call to
 * make in the first place, and a foreign id 404s.
 */
@ApiTags('Staff Room Types')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/room-types', version: VERSION_NEUTRAL })
export class StaffRoomTypesController {
  constructor(
    private readonly roomTypes: RoomTypesService,
    private readonly photos: RoomTypePhotosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('roomtype.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: RoomTypeFilterDto) {
    return this.roomTypes.list(me.propertyId, q);
  }

  @Get(':id')
  @RequireStaffPermissions('roomtype.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.roomTypes.get(me.propertyId, id);
  }

  @Post()
  @RequireStaffPermissions('roomtype.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: RoomTypeInputDto) {
    const row = await this.roomTypes.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.roomtype.created',
      entity: 'room_type',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  @Patch(':id')
  @RequireStaffPermissions('roomtype.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    const { before, after } = await this.roomTypes.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.roomtype.updated',
      entity: 'room_type',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  @Delete(':id')
  @RequireStaffPermissions('roomtype.delete')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.roomTypes.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.roomtype.deleted',
      entity: 'room_type',
      entityId: id,
      before: res.before,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return { id: res.id, deleted: res.deleted };
  }

  // ---------- Photos ----------
  //
  // Reading the gallery is `roomtype.read`, like every other read on this
  // controller; ADDING, REORDERING, RE-POINTING and DELETING a photo are all
  // `roomtype.update`, because each of them changes what the hotel advertises.
  // There is no separate photo permission: a manager who may edit the type may
  // edit its pictures, and nobody else may do either.

  @Get(':id/photos')
  @RequireStaffPermissions('roomtype.read')
  listPhotos(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.photos.list(me.propertyId, id);
  }

  /**
   * Multipart: `file` plus an optional `category`. Multer's own `fileSize`
   * limit is the first line of defence — it stops the bytes at the socket — and
   * the service re-checks mime and size before writing anything, so a caller
   * that bypasses the interceptor gets the same refusal.
   */
  @Post(':id/photos')
  @RequireStaffPermissions('roomtype.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async addPhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @UploadedFile() file: UploadedRoomTypePhoto | undefined,
    @Body() dto: UploadRoomTypePhotoDto,
  ) {
    const photo = await this.photos.upload(me.propertyId, id, file, dto?.category);
    await this.audit.record({
      action: 'staff.roomtype.photo_added',
      entity: 'room_type',
      entityId: id,
      after: { photoId: photo.id, category: photo.category, sizeBytes: photo.sizeBytes },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photo;
  }

  /**
   * Declared BEFORE the `:photoId` routes so "order" is never read as a photo
   * id — the same rule /rooms/bulk follows.
   */
  @Patch(':id/photos/order')
  @RequireStaffPermissions('roomtype.update')
  async reorderPhotos(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: ReorderRoomTypePhotosDto,
  ) {
    const photos = await this.photos.reorder(me.propertyId, id, dto.ids);
    await this.audit.record({
      action: 'staff.roomtype.photos_reordered',
      entity: 'room_type',
      entityId: id,
      after: { ids: dto.ids },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photos;
  }

  @Post(':id/photos/:photoId/primary')
  @RequireStaffPermissions('roomtype.update')
  async setPrimaryPhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const photo = await this.photos.setPrimary(me.propertyId, id, photoId);
    await this.audit.record({
      action: 'staff.roomtype.photo_primary_set',
      entity: 'room_type',
      entityId: id,
      after: { photoId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photo;
  }

  @Delete(':id/photos/:photoId')
  @RequireStaffPermissions('roomtype.update')
  async removePhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const res = await this.photos.remove(me.propertyId, id, photoId);
    await this.audit.record({
      action: 'staff.roomtype.photo_deleted',
      entity: 'room_type',
      entityId: id,
      before: { photoId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}

/**
 * Rooms, per property.
 *
 * The permission split is the whole design:
 *   room.read          — everyone who needs the board (reception, housekeeping,
 *                        attendants, technicians)
 *   room.status.update — the people who actually turn rooms over. NARROW: the
 *                        `:id/status` route below touches only `status`.
 *   room.create/update/delete — GM and AGM only. Renumbering a floor, moving a
 *                        room to a pricier type or removing it is a management
 *                        act, and folding it into the status route would hand
 *                        it to every room attendant.
 */
@ApiTags('Staff Rooms')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/rooms', version: VERSION_NEUTRAL })
export class StaffRoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly photos: RoomPhotosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireStaffPermissions('room.read')
  list(@CurrentStaff() me: AuthenticatedStaff, @Query() q: RoomFilterDto) {
    return this.rooms.list(me.propertyId, q);
  }

  @Post()
  @RequireStaffPermissions('room.create')
  async create(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: CreateRoomDto) {
    const row = await this.rooms.create(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.room.created',
      entity: 'room',
      entityId: row.id,
      after: row,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return row;
  }

  /**
   * Bulk create. Declared BEFORE `:id` so "bulk" is never swallowed as an id.
   */
  @Post('bulk')
  @RequireStaffPermissions('room.create')
  async bulkCreate(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: BulkCreateRoomsDto) {
    const res = await this.rooms.bulkCreate(me.propertyId, dto);
    await this.audit.record({
      action: 'staff.room.bulk_created',
      entity: 'room',
      entityId: dto.roomTypeId,
      after: {
        requested: res.requested,
        created: res.created,
        skipped: res.skipped,
        floor: dto.floor,
      },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Get(':id')
  @RequireStaffPermissions('room.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.rooms.get(me.propertyId, id);
  }

  @Patch(':id')
  @RequireStaffPermissions('room.update')
  async update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    const { before, after } = await this.rooms.update(me.propertyId, id, dto);
    await this.audit.record({
      action: 'staff.room.updated',
      entity: 'room',
      entityId: id,
      before,
      after,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return after;
  }

  /**
   * The narrow status route. Requires `room.status.update`, NOT `room.update`,
   * so housekeeping and reception can turn a room over without gaining the
   * ability to edit it. The DTO's @IsIn already rejects a status outside the
   * eight-state set, so an invalid transition never reaches the database.
   */
  /** Bulk status. Declared before `:id/status` so "status" is never read as an id. */
  @Post('status/bulk')
  @RequireStaffPermissions('room.status.update')
  async bulkStatus(@CurrentStaff() me: AuthenticatedStaff, @Body() dto: BulkRoomStatusDto) {
    const res = await this.rooms.bulkSetStatus(me.propertyId, dto.ids, dto.status, dto.note);
    await this.audit.record({
      action: 'staff.room.status_bulk_updated',
      entity: 'room',
      entityId: me.propertyId,
      after: { ids: dto.ids, status: dto.status, updated: res.updated },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  /** One tap at the end of the housekeeping round. */
  @Post('status/mark-all-clean')
  @RequireStaffPermissions('room.status.update')
  async markAllClean(@CurrentStaff() me: AuthenticatedStaff) {
    const res = await this.rooms.markAllClean(me.propertyId);
    await this.audit.record({
      action: 'staff.room.marked_all_clean',
      entity: 'room',
      entityId: me.propertyId,
      after: { updated: res.updated },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Post(':id/status')
  @RequireStaffPermissions('room.status.update')
  async setStatus(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: SetRoomStatusDto,
  ) {
    const res = await this.rooms.setStatus(me.propertyId, id, dto.status, dto.note);
    await this.audit.record({
      action: 'staff.room.status_changed',
      entity: 'room',
      entityId: id,
      before: { status: res.previousStatus },
      after: { status: res.status, number: res.number },
      reason: dto.note,
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  @Delete(':id')
  @RequireStaffPermissions('room.delete')
  async remove(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    const res = await this.rooms.remove(me.propertyId, id);
    await this.audit.record({
      action: 'staff.room.deleted',
      entity: 'room',
      entityId: id,
      before: { number: res.number },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }

  // ---------- Photos of THIS room ----------
  //
  // A deliberate mirror of the room-type photo routes above, and gated on the
  // same room.* permissions as the rest of this controller: whoever may edit a
  // room may picture it. Bytes never pass back through the API — the service
  // hands out short-lived presigned URLs.

  @Get(':id/photos')
  @RequireStaffPermissions('room.read')
  listPhotos(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.photos.list(me.propertyId, id);
  }

  /**
   * Multipart: `file` plus an optional `category`. Multer's own `fileSize`
   * limit stops the bytes at the socket, and the service re-checks mime and
   * size before writing anything.
   */
  @Post(':id/photos')
  @RequireStaffPermissions('room.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async addPhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @UploadedFile() file: UploadedRoomTypePhoto | undefined,
    @Body() dto: UploadRoomTypePhotoDto,
  ) {
    const photo = await this.photos.upload(me.propertyId, id, file, dto?.category);
    await this.audit.record({
      action: 'staff.room.photo_added',
      entity: 'room',
      entityId: id,
      after: { photoId: photo.id, category: photo.category, sizeBytes: photo.sizeBytes },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photo;
  }

  /** Declared BEFORE the `:photoId` routes so "order" is never read as an id. */
  @Patch(':id/photos/order')
  @RequireStaffPermissions('room.update')
  async reorderPhotos(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Body() dto: ReorderRoomTypePhotosDto,
  ) {
    const photos = await this.photos.reorder(me.propertyId, id, dto.ids);
    await this.audit.record({
      action: 'staff.room.photos_reordered',
      entity: 'room',
      entityId: id,
      after: { ids: dto.ids },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photos;
  }

  @Post(':id/photos/:photoId/primary')
  @RequireStaffPermissions('room.update')
  async setPrimaryPhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const photo = await this.photos.setPrimary(me.propertyId, id, photoId);
    await this.audit.record({
      action: 'staff.room.photo_primary_set',
      entity: 'room',
      entityId: id,
      after: { photoId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return photo;
  }

  @Delete(':id/photos/:photoId')
  @RequireStaffPermissions('room.update')
  async removePhoto(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    const res = await this.photos.remove(me.propertyId, id, photoId);
    await this.audit.record({
      action: 'staff.room.photo_deleted',
      entity: 'room',
      entityId: id,
      before: { photoId },
      actorId: me.id,
      actorEmail: me.email,
      actorRole: me.role,
    });
    return res;
  }
}

/**
 * The catalogue, read-only, for the room-type form's amenity picker.
 * ACTIVE only — an archived entry stays attached where it already is but is
 * never offered again.
 */
@ApiTags('Staff Amenities')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/amenities', version: VERSION_NEUTRAL })
export class StaffAmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  @Get()
  @RequireStaffPermissions('roomtype.read')
  list() {
    return this.amenities.listActive('ROOM');
  }
}
