import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserService } from './user.service';
import { PlanService } from './plan.service';
import { UserController } from './user.controller';
import { UserAdminController } from './user-admin.controller';
import { User } from './entities/user.entity';
import { PushDevice } from './entities/push-device.entity';
import { Post } from '../post/entities/post.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Post, PushDevice]),
    ConfigModule,
    AuthModule,
  ],
  // UserAdminController shares the `user` prefix — it must stay last so its
  // `:id` routes don't shadow UserController's literal paths.
  controllers: [UserController, UserAdminController],
  providers: [UserService, PlanService],
  exports: [UserService, PlanService],
})
export class UserModule {}
