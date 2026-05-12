import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

// DTO
export class CreateSavedSearchDto {
  @ApiProperty({ example: 'Gulshan 2BHK under 30k' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Serialized filter criteria object' })
  @IsObject()
  filters: Record<string, any>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  alertEnabled?: boolean;
}

@Injectable()
export class SavedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSavedSearchDto) {
    return this.prisma.savedSearch.create({
      data: {
        userId,
        name: dto.name,
        filters: dto.filters,
        alertEnabled: dto.alertEnabled ?? true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, userId: string) {
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) throw new NotFoundException('Saved search not found');
    if (search.userId !== userId) throw new ForbiddenException();

    await this.prisma.savedSearch.delete({ where: { id } });
    return { message: 'Saved search deleted' };
  }

  async toggleAlert(id: string, userId: string) {
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) throw new NotFoundException();
    if (search.userId !== userId) throw new ForbiddenException();

    return this.prisma.savedSearch.update({
      where: { id },
      data: { alertEnabled: !search.alertEnabled },
    });
  }
}
