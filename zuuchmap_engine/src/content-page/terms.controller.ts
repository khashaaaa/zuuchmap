import { Controller, Get, Post, Body, Patch, Param, Delete, Res } from '@nestjs/common';
import { Response } from 'express';
import { ContentPageService } from './content-page.service';
import { CreateContentPageDto, UpdateContentPageDto } from './dto/content-page.dto';

const TYPE = 'TERMS' as const;

@Controller('terms')
export class TermsController {
  constructor(private readonly svc: ContentPageService) {}

  @Post()
  create(@Body() dto: CreateContentPageDto) { return this.svc.create(TYPE, dto); }

  @Get()
  findAll() { return this.svc.findAll(TYPE); }

  @Get('page')
  async getPage(@Res() res: Response) {
    const page = await this.svc.findLatest(TYPE);
    const html = this.svc.buildPageHtml(TYPE, page);
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:;");
    res.type('html').send(html);
  }

  @Get(':id')
  findOne(@Param('id') id: number) { return this.svc.findOne(id, TYPE); }

  @Patch(':id')
  update(@Param('id') id: number, @Body() dto: UpdateContentPageDto) { return this.svc.update(id, TYPE, dto); }

  @Delete(':id')
  remove(@Param('id') id: number) { return this.svc.remove(id, TYPE); }
}
