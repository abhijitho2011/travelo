import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { expenseCategoryValues, expenseStatusValues } from '../../database/schema';

export class ExpenseFilterDto {
  @IsOptional() @IsIn(expenseStatusValues) status?: (typeof expenseStatusValues)[number];
  @IsOptional() @IsIn(expenseCategoryValues) category?: (typeof expenseCategoryValues)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateExpenseDto {
  @IsIn(expenseCategoryValues) category!: (typeof expenseCategoryValues)[number];
  /** Paise, integer, non-negative. */
  @IsInt() @Min(0) @Max(1_000_000_000) amountPaise!: number;
  @IsOptional() @IsString() @Length(1, 200) vendor?: string;
  @IsOptional() @IsISO8601() incurredOn?: string;
  @IsOptional() @IsString() @Length(1, 2000) note?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsIn(expenseCategoryValues) category?: (typeof expenseCategoryValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) amountPaise?: number;
  @IsOptional() @IsString() @Length(0, 200) vendor?: string;
  @IsOptional() @IsISO8601() incurredOn?: string;
  @IsOptional() @IsString() @Length(0, 2000) note?: string;
}

export class ExpenseStatusDto {
  @IsIn(expenseStatusValues) status!: (typeof expenseStatusValues)[number];
}
