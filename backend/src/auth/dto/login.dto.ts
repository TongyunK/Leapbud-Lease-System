import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  account!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(1)
  password!: string;
}
