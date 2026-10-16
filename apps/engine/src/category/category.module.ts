import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from './admin-guard';
import { CategoryAdminController, CategoryController } from './category.controller';
import { CategorySchema } from './category.entity';
import { CategoryService } from './category.service';

@Module({
  imports: [TypeOrmModule.forFeature([CategorySchema])],
  controllers: [CategoryController, CategoryAdminController],
  providers: [CategoryService, AdminGuard],
  exports: [CategoryService],
})
export class CategoryModule {}
