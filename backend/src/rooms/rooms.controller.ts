import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'buildingId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Room list aligned with frontend RoomRecord' })
  findAll(
    @Query('keyword') keyword?: string,
    @Query('buildingId') buildingId?: string,
    @Query('status') status?: string,
  ) {
    return this.roomsService.findAll({ keyword, buildingId, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }
}
