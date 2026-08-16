import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Viewedpost } from './entities/viewedpost.entity';
import { ViewedpostService } from './viewedpost.service';

@Module({
  imports: [TypeOrmModule.forFeature([Viewedpost])],
  providers: [ViewedpostService],
  exports: [ViewedpostService],
})
export class ViewedpostModule {}

