import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ROOM_TYPE_TONES = ['office', 'meeting', 'desk', 'studio', 'other'] as const;
export type RoomTypeToneDto = (typeof ROOM_TYPE_TONES)[number];

export class CreateRoomTypeDto {
  @ApiProperty({ example: '辦公室' })
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiPropertyOptional({ enum: ROOM_TYPE_TONES, default: 'other' })
  @IsOptional()
  @IsIn(ROOM_TYPE_TONES)
  tone?: RoomTypeToneDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRoomTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiPropertyOptional({ enum: ROOM_TYPE_TONES })
  @IsOptional()
  @IsIn(ROOM_TYPE_TONES)
  tone?: RoomTypeToneDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
