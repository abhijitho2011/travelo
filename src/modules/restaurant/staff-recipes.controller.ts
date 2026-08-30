import { Body, Controller, Get, Param, Put, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  RequireStaffPermissions,
  StaffPermissionsGuard,
} from '../staff-auth/staff-permissions.guard';
import { CurrentStaff, AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import { RecipesService } from './recipes.service';

class RecipeLineDto {
  @IsUUID() inventoryItemId!: string;
  @IsInt() @Min(1) qtyPerUnit!: number;
}
class SetRecipeDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => RecipeLineDto) lines!: RecipeLineDto[];
}

@ApiTags('Staff Restaurant Recipes')
@ApiBearerAuth()
@UseGuards(StaffJwtGuard, StaffPermissionsGuard)
@Controller({ path: 'api/v1/staff/restaurant/menu', version: VERSION_NEUTRAL })
export class StaffRecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get(':id/recipe')
  @RequireStaffPermissions('menu.read')
  get(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string) {
    return this.recipes.get(me.propertyId, id);
  }

  @Put(':id/recipe')
  @RequireStaffPermissions('menu.manage')
  set(@CurrentStaff() me: AuthenticatedStaff, @Param('id') id: string, @Body() dto: SetRecipeDto) {
    return this.recipes.set(me.propertyId, id, dto.lines);
  }
}
