import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OwnerJwtGuard } from './owner-jwt.guard';
import { SubscriptionStatusGuard } from '../../common/guards/subscription-status.guard';
import { CurrentOwner, AuthenticatedOwner } from './current-owner.decorator';
import { OwnerPortalService } from './owner-portal.service';
import { LocationsService } from './locations.service';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_PROPERTY,
  PropertyPhotosService,
  type UploadedPhoto,
} from './property-photos.service';
import { CreatePropertyDto, CreateStaffDto, SetStaffStatusDto, UpdateStaffDto } from './dto';

@ApiTags('Owner Portal')
@ApiBearerAuth()
@UseGuards(OwnerJwtGuard, SubscriptionStatusGuard)
@Controller({ path: 'api/v1/owner', version: VERSION_NEUTRAL })
export class OwnerPortalController {
  constructor(
    private readonly portal: OwnerPortalService,
    private readonly locations: LocationsService,
    private readonly photos: PropertyPhotosService,
  ) {}

  @Get('portfolio/summary')
  summary(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.portal.portfolioSummary(owner.id);
  }

  @Get('properties')
  listProperties(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.portal.listProperties(owner.id);
  }

  @Post('properties')
  createProperty(@CurrentOwner() owner: AuthenticatedOwner, @Body() dto: CreatePropertyDto) {
    return this.portal.createProperty(owner.id, dto);
  }

  // ---------- Property photos ----------

  @Get('properties/:id/photos')
  listPhotos(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.photos.list(owner.id, id);
  }

  @Post('properties/:id/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_PROPERTY, {
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_PROPERTY },
    }),
  )
  uploadPhotos(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @UploadedFiles() files: UploadedPhoto[],
  ) {
    return this.photos.upload(owner.id, id, files ?? []);
  }

  /**
   * Owner-scoped entry point for one photo. Auth is checked here, then the
   * caller is redirected to a short-lived presigned URL, so image bytes never
   * proxy through the API and there is no public static directory. Under the
   * local (dev) driver there is nothing to sign, so the bytes are streamed.
   *
   * `@Res()` is deliberate: it takes this route out of the JSON envelope, which
   * would otherwise wrap — and break — a redirect or a binary body.
   */
  @Get('properties/:id/photos/:photoId/raw')
  async rawPhoto(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const photo = await this.photos.resolveForServing(owner.id, id, photoId);
    if (photo.url) {
      res.redirect(302, photo.url);
      return;
    }
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    photo.stream!.pipe(res);
  }

  @Delete('properties/:id/photos/:photoId')
  deletePhoto(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photos.remove(owner.id, id, photoId);
  }

  /** Every staff member across every property this owner holds. */
  @Get('staff')
  listAllStaff(@CurrentOwner() owner: AuthenticatedOwner) {
    return this.portal.listAllStaff(owner.id);
  }

  @Get('properties/:id/staff')
  listStaff(@CurrentOwner() owner: AuthenticatedOwner, @Param('id') id: string) {
    return this.portal.listStaff(owner.id, id);
  }

  @Post('properties/:id/staff')
  createStaff(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.portal.createStaff(owner.id, id, dto);
  }

  @Patch('properties/:id/staff/:sid')
  updateStaff(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.portal.updateStaff(owner.id, id, sid, dto);
  }

  @Post('properties/:id/staff/:sid/status')
  setStaffStatus(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body() dto: SetStaffStatusDto,
  ) {
    return this.portal.setStaffStatus(owner.id, id, sid, dto.status);
  }

  @Delete('properties/:id/staff/:sid')
  deleteStaff(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param('id') id: string,
    @Param('sid') sid: string,
  ) {
    return this.portal.deleteStaff(owner.id, id, sid);
  }

  @Get('reference/locations')
  referenceLocations() {
    return this.locations.asStatesMap();
  }
}
