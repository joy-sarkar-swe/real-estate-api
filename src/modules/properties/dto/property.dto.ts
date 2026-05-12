import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BhkType,
  FacingDirection,
  FurnishingType,
  PropertyStatus,
  PropertyType,
} from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({ example: '2BHK Apartment in Gulshan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Spacious apartment with modern amenities...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({ enum: BhkType })
  @IsEnum(BhkType)
  bhkType: BhkType;

  @ApiProperty({ enum: PropertyType })
  @IsEnum(PropertyType)
  propertyType: PropertyType;

  @ApiProperty({ enum: FurnishingType })
  @IsEnum(FurnishingType)
  furnishingType: FurnishingType;

  @ApiProperty({ example: 'House 12, Road 5, Gulshan 1' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'Dhaka' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Dhaka' })
  @IsString()
  state: string;

  @ApiProperty({ example: '1212' })
  @IsString()
  pincode: string;

  @ApiProperty({ example: 23.7938 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 90.4044 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 1200, description: 'Area in sq ft' })
  @IsNumber()
  @Min(1)
  area: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  floor?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  totalFloors?: number;

  @ApiPropertyOptional({ enum: FacingDirection })
  @IsOptional()
  @IsEnum(FacingDirection)
  facing?: FacingDirection;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPetFriendly?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @ApiProperty({ example: '2024-02-01' })
  @IsDateString()
  availableFrom: string;

  @ApiPropertyOptional({ example: ['WiFi', 'AC', 'Gym', 'Swimming Pool'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ example: ['https://cdn.example.com/img1.jpg'] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];
}

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}

export class UpdatePropertyStatusDto {
  @ApiProperty({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  status: PropertyStatus;
}
