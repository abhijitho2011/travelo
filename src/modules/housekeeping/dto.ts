import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  housekeepingPriorityValues,
  housekeepingTaskStatusValues,
  housekeepingTaskTypeValues,
  workOrderPriorityValues,
  workOrderStatusValues,
} from '../../database/schema';

// ---------- Housekeeping tasks ----------

export class TaskFilterDto {
  @IsOptional()
  @IsIn(housekeepingTaskStatusValues)
  status?: (typeof housekeepingTaskStatusValues)[number];

  @IsOptional()
  @IsIn(housekeepingTaskTypeValues)
  type?: (typeof housekeepingTaskTypeValues)[number];

  @IsOptional() @IsUUID() assignee?: string;

  @IsOptional() @IsUUID() roomId?: string;

  @IsOptional() @IsString() @Length(1, 128) area?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateTaskDto {
  /** Exactly one of roomId / area — enforced in the service and by the CHECK. */
  @IsOptional() @IsUUID() roomId?: string;

  @IsOptional() @IsString() @Length(1, 128) area?: string;

  @IsIn(housekeepingTaskTypeValues) type!: (typeof housekeepingTaskTypeValues)[number];

  @IsOptional()
  @IsIn(housekeepingPriorityValues)
  priority?: (typeof housekeepingPriorityValues)[number];

  @IsOptional() @IsUUID() assignedStaffId?: string;

  @IsOptional() @IsString() @Length(0, 2000) guestRequest?: string;

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;

  /** ISO datetime; when the task should be done by. */
  @IsOptional() @IsString() @Length(1, 40) dueAt?: string;
}

export class AssignTaskDto {
  @IsUUID() staffId!: string;
}

export class CompleteTaskDto {
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class InspectTaskDto {
  @IsBoolean() pass!: boolean;

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

// ---------- Work orders ----------

export class WorkOrderFilterDto {
  @IsOptional() @IsIn(workOrderStatusValues) status?: (typeof workOrderStatusValues)[number];

  @IsOptional() @IsIn(workOrderPriorityValues) priority?: (typeof workOrderPriorityValues)[number];

  @IsOptional() @IsUUID() assignee?: string;

  @IsOptional() @IsUUID() roomId?: string;

  @IsOptional() @IsString() @Length(1, 200) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateWorkOrderDto {
  @IsOptional() @IsUUID() roomId?: string;

  @IsString() @Length(3, 200) title!: string;

  @IsOptional() @IsString() @Length(0, 4000) description?: string;

  @IsOptional() @IsIn(workOrderPriorityValues) priority?: (typeof workOrderPriorityValues)[number];

  /** When true, accepting the order takes the room off the board (MAINTENANCE). */
  @IsOptional() @IsBoolean() takesRoomOutOfService?: boolean;
}

export class WorkOrderPartDto {
  @IsString() @Length(1, 200) name!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000) qty?: number;
}

export class CompleteWorkOrderDto {
  /** Required — what was actually done. Enforced in the service too. */
  @IsString() @Length(3, 4000) resolution!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderPartDto)
  partsUsed?: WorkOrderPartDto[];
}

export class CancelWorkOrderDto {
  @IsString() @Length(3, 500) reason!: string;
}
