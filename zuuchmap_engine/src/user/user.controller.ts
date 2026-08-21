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

  @Post('check')
  async findByPhoneNumber(@Body() body: { phone_number: string }) {
    const { phone_number } = body;

    if (!phone_number) {
      throw new HttpException('Phone number is required', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userService.findByPhoneNumber(phone_number);

    if (!user) {
      throw new NotFoundException(`User with phone number ${phone_number} not found`);
    }

    return {
      id: user.id,
      type: user.type,
      is_verified: user.is_verified,
      biometric: user.biometric,
      exists: true,
      hasUserType: !!user.type,
      isVerified: user.is_verified,
      hasBiometric: user.biometric === 'enrolled'
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

  /**
   * Records that the user opted into biometric unlock on this device.
   *
   * This is a stored preference only — it grants no authentication power.
   * Biometrics gate the locally-stored token on the device; the server never
   * accepts a "biometric" claim as proof of identity.
   */
  @Post('otp/enroll-biometric')
  @UseGuards(JwtAuthGuard)
  async enrollBiometric(@Req() req, @Body() body: { device_info?: any }) {
    const result = await this.userService.enrollBiometric({
      phone_number: req.user.phone_number,
      device_info: body.device_info,
    });

    return {
      ...result,
      biometricEnrolled: true,
      nextStep: 'dashboard'
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
  async savePushToken(@Req() req, @Body('push_token') pushToken: string) {
    if (!pushToken) {
      throw new HttpException('push_token is required', HttpStatus.BAD_REQUEST);
    }
    await this.userService.savePushToken(req.user.id, pushToken);
    return { success: true };
  }

  // Called on logout so this device stops receiving the account's pushes.
  @Delete('push-token')
  @UseGuards(JwtAuthGuard)
  async clearPushToken(@Req() req) {
    await this.userService.savePushToken(req.user.id, null);
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
