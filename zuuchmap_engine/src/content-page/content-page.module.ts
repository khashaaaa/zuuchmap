import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentPage } from './entities/content-page.entity';
import { ContentPageService } from './content-page.service';
import { PrivacyController } from './privacy.controller';
import { TermsController } from './terms.controller';
import { AccountDeletionController } from './account-deletion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContentPage])],
  providers: [ContentPageService],
  controllers: [PrivacyController, TermsController, AccountDeletionController],
})
export class ContentPageModule {}
