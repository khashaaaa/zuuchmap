import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpException,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  UseGuards,
  Req,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import {
  createProfilePictureInterceptor,
  handleSingleUpload,
} from '../utils/uploader';
import { isAdmin } from '../admin/admin.guard';
import { profileSummary } from '../utils/public-user';
import { vapidPublicKey } from '../utils/webPush';

// No per-route try/catch here: the global AllExceptionsFilter already
// normalizes errors — the old rethrow wrappers only stripped the
// machine-readable `code` clients branch on.
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('type')
  @UseGuards(JwtAuthGuard)
  async setUserType(@Req() req, @Body() body: { type: string }) {
    const { type } = body;

    if (!type || !['PROVIDER', 'CUSTOMER'].includes(type)) {
      throw new HttpException(
        'Type must be either "PROVIDER" or "CUSTOMER"',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.userService.setUserType(
      req.user.phone_number,
      type,
    );

    return {
      ...result,
      userType: type,
      redirectTo:
        type === 'PROVIDER' ? 'ProviderDashboard' : 'CustomerDashboard',
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Req() req) {
    const user = await this.userService.findOne(req.user.id);

    return {
      ...user,
      ...profileSummary(user),
      is_admin: isAdmin(user.phone_number),
    };
  }

  @Get('profile/posts')
  @UseGuards(JwtAuthGuard)
  async getCurrentUserPosts(@Req() req) {
    return this.userService.getUserPosts(req.user.id);
  }

  @Put('push-token')
  @UseGuards(JwtAuthGuard)
  async savePushToken(
    @Req() req,
    @Body('push_token') pushToken: string,
    @Body('platform') platform?: string,
  ) {
    if (!pushToken) {
      throw new HttpException('push_token is required', HttpStatus.BAD_REQUEST);
    }
    await this.userService.savePushToken(req.user.id, pushToken, platform);
    return { success: true };
  }

  // Called on logout so this device stops receiving the account's pushes.
  @Delete('push-token')
  @UseGuards(JwtAuthGuard)
  async clearPushToken(@Req() req, @Body('push_token') pushToken?: string) {
    // Unbinds just the device that asked. Without a token — an older client —
    // every device for the account goes, which is the old behaviour.
    await this.userService.removePushToken(req.user.id, pushToken);
    return { success: true };
  }

  /**
   * The VAPID public key the browser needs to subscribe. Served rather than
   * built into the web bundle so the key pair can be rotated without a deploy
   * of the front end — and so the two halves can never drift apart.
   */
  @Get('push/vapid-key')
  @UseGuards(JwtAuthGuard)
  getVapidKey() {
    return { key: vapidPublicKey() };
  }

  /** Binds this browser for web push. Idempotent — the client re-sends on every load. */
  @Put('push/web')
  @UseGuards(JwtAuthGuard)
  async saveWebPush(
    @Req() req,
    @Body('endpoint') endpoint: string,
    @Body('keys') keys: { p256dh?: string; auth?: string },
  ) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new HttpException(
        'endpoint and keys are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.userService.saveWebPushSubscription(req.user.id, endpoint, {
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    return { success: true };
  }

  /** Called on logout, and when the browser reports the subscription revoked. */
  @Delete('push/web')
  @UseGuards(JwtAuthGuard)
  async clearWebPush(@Req() req, @Body('endpoint') endpoint?: string) {
    await this.userService.removePushToken(req.user.id, endpoint);
    return { success: true };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createProfilePictureInterceptor())
  async updateProfile(
    @Req() req,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    if (req.user.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    let profilePicture: string | undefined = undefined;
    if (file) {
      const processedImage = await handleSingleUpload(
        file,
        'PROFILE',
      );
      if (processedImage) {
        profilePicture = processedImage;
      }
    }

    const updatedUser = await this.userService.update(
      id,
      updateUserDto,
      profilePicture,
    );

    return {
      ...updatedUser,
      ...profileSummary(updatedUser),
    };
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteOwnAccount(@Req() req) {
    await this.userService.remove(req.user.id);
    return { success: true, message: 'Account deleted successfully' };
  }
}
