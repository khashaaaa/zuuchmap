import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SavedSearchService } from './saved-search.service';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';

@Controller('saved-searches')
@UseGuards(JwtAuthGuard)
export class SavedSearchController {
  constructor(private readonly service: SavedSearchService) {}

  @Get()
  list(@Req() req) {
    return this.service.list(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateSavedSearchDto, @Req() req) {
    return this.service.create(req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    return this.service.remove(req.user.id, id);
  }
}
