import {
  ArrayMaxSize,
  IsArray,
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
}

export class ImportRoomsDto {
  @ApiProperty({ type: [CreateRoomDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateRoomDto)
  items!: CreateRoomDto[];
}
