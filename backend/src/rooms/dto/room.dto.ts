import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RoomStatus } from '@prisma/client';

export class CreateRoomDto {
  @ApiProperty({ example: 'HH-0901' })
  @IsString()
  @MinLength(1)
  roomCode!: string;

  @ApiProperty({ example: 'Sample Room' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional({ description: '所属大厦 ID' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({ description: '所属大厦名称（无 buildingId 时用于关联）' })
  @IsOptional()
  @IsString()
  buildingName?: string;

  @ApiPropertyOptional({ enum: RoomStatus })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sizeSqft?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  windowConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latestContract?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subleaseMark?: string;

  @ApiPropertyOptional({ description: 'whole_only=只能整租；flexible=可整可分；part_only=只能分租' })
  @IsOptional()
  @IsString()
  leaseCapability?: string;

  @ApiPropertyOptional({ description: '分租份位标签，如 ["A","B","C"]', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  splitLabels?: string[];

  @ApiPropertyOptional({ description: '分租份数（未传 splitLabels 时按 A/B/C… 生成）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  splitCount?: number;

  @ApiPropertyOptional({ description: '是否允许短租开票（无合约）' })
  @IsOptional()
  @IsBoolean()
  allowShortTerm?: boolean;
}

export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  roomCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingName?: string;

  @ApiPropertyOptional({ enum: RoomStatus })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sizeSqft?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  windowConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acConfig?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latestContract?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subleaseMark?: string;

  @ApiPropertyOptional({ description: 'whole_only=只能整租；flexible=可整可分；part_only=只能分租' })
  @IsOptional()
  @IsString()
  leaseCapability?: string;

  @ApiPropertyOptional({ description: '分租份位标签，如 ["A","B","C"]', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  splitLabels?: string[];

  @ApiPropertyOptional({ description: '分租份数（未传 splitLabels 时按 A/B/C… 生成）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  splitCount?: number;

  @ApiPropertyOptional({ description: '是否允许短租开票（无合约）' })
  @IsOptional()
  @IsBoolean()
  allowShortTerm?: boolean;
}

export class ImportRoomsDto {
  @ApiProperty({ type: [CreateRoomDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateRoomDto)
  items!: CreateRoomDto[];
}

/** 批量修改房间字段（仅 SuperAdmin；仅提交的字段会被更新） */
export class BatchUpdateRoomsDto {
  @ApiProperty({ type: [String], description: '要修改的房间 ID 列表' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Type(() => String)
  ids!: string[];

  @ApiPropertyOptional({ description: '是否允许短租开票（无合约）' })
  @IsOptional()
  @IsBoolean()
  allowShortTerm?: boolean;

  @ApiPropertyOptional({ description: '房间类型' })
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional({ description: '所属大厦 ID' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({ description: '窗配置' })
  @IsOptional()
  @IsString()
  windowConfig?: string;

  @ApiPropertyOptional({ description: '空调配置' })
  @IsOptional()
  @IsString()
  acConfig?: string;

  @ApiPropertyOptional({ description: 'whole_only / flexible / part_only' })
  @IsOptional()
  @IsString()
  leaseCapability?: string;

  @ApiPropertyOptional({ description: '分租份数（仅 leaseCapability=flexible 时生效）' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  splitCount?: number;

  @ApiPropertyOptional({ description: '月租' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  monthlyRent?: number;

  @ApiPropertyOptional({ description: '日租' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRent?: number;

  @ApiPropertyOptional({ description: '时租' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourlyRent?: number;

  @ApiPropertyOptional({ description: '房间呎寸' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sizeSqft?: number;

  @ApiPropertyOptional({ description: '房间描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
