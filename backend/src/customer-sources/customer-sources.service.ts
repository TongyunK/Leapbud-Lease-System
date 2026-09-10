import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerSourceDto, UpdateCustomerSourceDto } from './dto/customer-source.dto';
import { customerSourceAuditInclude, toCustomerSourceDto } from './customer-source.mapper';

@Injectable()
export class CustomerSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { activeOnly?: boolean }) {
    const where: Prisma.CustomerSourceOptionWhereInput = {};
    if (params.activeOnly) where.active = true;

    const rows = await this.prisma.customerSourceOption.findMany({
      where,
      include: customerSourceAuditInclude,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toCustomerSourceDto);
  }

  async findOne(id: string) {
    const row = await this.prisma.customerSourceOption.findUnique({
      where: { id },
      include: customerSourceAuditInclude,
    });
    if (!row) throw new NotFoundException(`Customer source ${id} not found`);
    return toCustomerSourceDto(row);
  }

  async create(dto: CreateCustomerSourceDto, actor = '') {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Label is required');
    const actorId = actor || null;

    try {
      const row = await this.prisma.customerSourceOption.create({
        data: {
          label,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
        include: customerSourceAuditInclude,
      });
      return toCustomerSourceDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Customer source「${label}」already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCustomerSourceDto, actor = '') {
    const existing = await this.prisma.customerSourceOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer source ${id} not found`);

    try {
      const row = await this.prisma.customerSourceOption.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? dto.label.trim() : undefined,
          sortOrder: dto.sortOrder,
          active: dto.active,
          ...(actor ? { updatedById: actor } : {}),
        },
        include: customerSourceAuditInclude,
      });
      return toCustomerSourceDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Customer source「${dto.label?.trim()}」already exists`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.customerSourceOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer source ${id} not found`);
    await this.prisma.customerSourceOption.delete({ where: { id } });
    return { success: true };
  }
}
