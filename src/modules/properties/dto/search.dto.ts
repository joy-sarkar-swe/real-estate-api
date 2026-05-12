import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BhkType, FurnishingType, PropertyType } from '@prisma/client';
import { PaginationDto } from '../../../shared/dto/pagination.dto';

export enum SortField {
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  RECENCY = 'recency',
  DISTANCE = 'distance',
}

export class SearchPropertyDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'Gulshan' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: BhkType, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(BhkType, { each: true })
  bhkType?: BhkType[];

  @ApiPropertyOptional({ enum: PropertyType, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(PropertyType, { each: true })
  propertyType?: PropertyType[];

  @ApiPropertyOptional({ enum: FurnishingType, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(FurnishingType, { each: true })
  furnishingType?: FurnishingType[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPetFriendly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  hasParking?: boolean;

  // Geo search
  @ApiPropertyOptional({ example: 23.7938 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 90.4044 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: 5, description: 'Radius in km' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: SortField, default: SortField.RECENCY })
  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.RECENCY;

  @ApiPropertyOptional({ example: '2024-02-01' })
  @IsOptional()
  @IsString()
  availableFrom?: string;
}
