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
import { CheckUserDto } from './dto/check-user.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import {
  createProfilePictureInterceptor,
  ImageUploadHandler
} from '../utils/uploader';
import { isAdmin } from '../admin/admin.guard';
import { profileSummary } from '../utils/public-user';

// No per-route try/catch here: the global AllExceptionsFilter already
// normalizes errors — the old rethrow wrappers only stripped the
// machine-readable `code` clients branch on.
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  /**
   * LEGACY — kept only for app builds already installed.
   *
   * It answers "does this number have an account, and what type" to an
   * unauthenticated caller. Mongolian mobile numbers are 8 digits over a
   * handful of prefixes, so under the global 100/min default this was a
   * walkable enumeration oracle that also returned the account UUID. The
   * current app no longer calls it: `auth/verify/start` carries the account
   * type on a result that has actually proven possession of the number.
   *
   * Until old builds age out it stays, at the same 3/min per IP that
   * `verify/start` gets — enough for a human signing in, useless for a sweep.
   * Delete the route (and `checkUserExists` in the app) once those builds are gone.
   */
  @Post('check')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async findByPhoneNumber(@Body() body: CheckUserDto) {
    const { phone_number } = body;

    const user = await this.userService.findByPhoneNumber(phone_number);

    if (!user) {
      throw new NotFoundException(`User with phone number ${phone_number} not found`);
    }

    return {
      id: user.id,
      type: user.type,
      is_verified: user.is_verified,
      exists: true,
      hasUserType: !!user.type,
      // `isVerified` duplicates `is_verified` above, and both it and
      // `hasUserType` are kept only for app builds already installed — unlike
      // the biometric pair that stood here, they still return real values, so
      // dropping them would change what an old client sees.
      isVerified: user.is_verified,
    };
  }

  @Post('type')
  @UseGuards(JwtAuthGuard)
  async setUserType(@Req() req, @Body() body: { type: string }) {
    const { type } = body;

    if (!type || !['PROVIDER', 'CUSTOMER'].includes(type)) {
      throw new HttpException('Type must be either "PROVIDER" or "CUSTOMER"', HttpStatus.BAD_REQUEST);
    }

    const result = await this.userService.setUserType(req.user.phone_number, type);

    return {
      ...result,
      userType: type,
      redirectTo: type === 'PROVIDER' ? 'ProviderDashboard' : 'CustomerDashboard'
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

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(createProfilePictureInterceptor())
  async updateProfile(
    @Req() req,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })
        ],
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
      const processedImage = await ImageUploadHandler.handleSingleUpload(file, 'PROFILE');
      if (processedImage) {
        profilePicture = processedImage;
      }
    }

    const updatedUser = await this.userService.update(id, updateUserDto, profilePicture);

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
