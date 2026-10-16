import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryModule } from '../category/category.module';
import { CategoryService } from '../category/category.service';
import { User } from '../user/entities/user.entity';
import { UserModule } from '../user/user.module';
import { PeopleModule } from '../people/people.module';
import { Post } from './entities/post.entity';
import { PostView } from './entities/post-view.entity';
import { InMemoryListingEvents, LISTING_EVENTS } from './listing-events';
import { env } from '../config/env';
import { AvailabilityService } from './availability.service';
import { ContactService } from './contact.service';
import { LikeController, SavedSearchController } from './customer.controller';
import { LikeService } from './like.service';
import { PHOTO_STORAGE, R2PhotoStorage, UnconfiguredPhotoStorage } from './photo-storage';
import { PostExpiryService } from './post-expiry.service';
import { PostViewService } from './post-view.service';
import { PostAdminController, PostController } from './post.controller';
import { PostService } from './post.service';
import { SavedSearchService } from './saved-search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, PostView, User]), CategoryModule, UserModule, PeopleModule],
  // PostController has `:id` routes; the admin controller lives under another prefix.
  controllers: [PostController, PostAdminController, LikeController, SavedSearchController],
  providers: [
    PostService,
    PostViewService,
    AvailabilityService,
    ContactService,
    LikeService,
    SavedSearchService,
    PostExpiryService,
    { provide: LISTING_EVENTS, useClass: InMemoryListingEvents },
    {
      provide: PHOTO_STORAGE,
      useFactory: () => {
        const r2 = env().R2;
        return r2 ? new R2PhotoStorage(r2) : new UnconfiguredPhotoStorage();
      },
    },
  ],
  exports: [PostService, AvailabilityService, ContactService, LikeService, SavedSearchService, LISTING_EVENTS, PHOTO_STORAGE],
})
export class PostModule implements OnModuleInit {
  constructor(
    private readonly categories: CategoryService,
    private readonly posts: PostService,
  ) {}

  onModuleInit(): void {
    this.categories.setCountProvider(() => this.posts.countLiveByCategory());
  }
}
