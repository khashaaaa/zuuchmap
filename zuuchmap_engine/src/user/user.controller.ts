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
  NotFoundException
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import {
  createProfilePictureInterceptor,
  ImageUploadHandler
} from '../utils/uploader';
import { isAdmin, AdminGuard } from '../admin/admin.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Post('check')
  async findByPhoneNumber(@Body() body: { phone_number: string }) {
    try {
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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || `Failed to retrieve user with phone number`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('type')
  @UseGuards(JwtAuthGuard)
  async setUserType(@Req() req, @Body() body: { type: string }) {
    try {
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
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to set user type',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('otp/enroll-biometric')
  @UseGuards(JwtAuthGuard)
  async enrollBiometric(@Req() req, @Body() body: { device_info?: any }) {
    try {
      const result = await this.userService.enrollBiometric({
        phone_number: req.user.phone_number,
        device_info: body.device_info,
      });

      return {
        ...result,
        biometricEnrolled: true,
        nextStep: 'dashboard'
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to enroll biometric',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Req() req) {
    try {
      const user = await this.userService.findOne(req.user.id);

      return {
        ...user,
        fullName: user.parent_name && user.given_name
          ? `${user.parent_name} ${user.given_name}`
          : user.given_name || user.parent_name || null,
        hasCompany: !!user.company,
        isProfileComplete: !!(user.parent_name && user.given_name && user.type),
        profileCompleteness: this.calculateProfileCompleteness(user),
        is_admin: isAdmin(user.phone_number),
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve user profile',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('profile/posts')
  @UseGuards(JwtAuthGuard)
  async getCurrentUserPosts(@Req() req) {
    try {
      return await this.userService.getUserPosts(req.user.id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve user posts',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
    try {
      if (req.user.id !== id) {
        throw new HttpException('You can only update your own profile', HttpStatus.FORBIDDEN);
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
        fullName: updatedUser.parent_name && updatedUser.given_name
          ? `${updatedUser.parent_name} ${updatedUser.given_name}`
          : updatedUser.given_name || updatedUser.parent_name || null,
        profileCompleteness: this.calculateProfileCompleteness(updatedUser)
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update user profile',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll() {
    try {
      const users = await this.userService.findAll();
      return users.map((user) => ({
        ...user,
        is_admin: isAdmin(user.phone_number),
      }));
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve users',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    try {
      const user = await this.userService.findOne(id);

      return {
        ...user,
        fullName: user.parent_name && user.given_name
          ? `${user.parent_name} ${user.given_name}`
          : user.given_name || user.parent_name || null,
        hasCompany: !!user.company,
        isProfileComplete: !!(user.parent_name && user.given_name && user.type),
        is_admin: isAdmin(user.phone_number),
      };
    } catch (error) {
      throw new HttpException(
        error.message || `Failed to retrieve user with ID ${id}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteOwnAccount(@Req() req) {
    try {
      await this.userService.remove(req.user.id);
      return { success: true, message: 'Account deleted successfully' };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to delete account',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    try {
      await this.userService.remove(id);
      return {
        message: `User with ID ${id} successfully deleted`,
        success: true
      };
    } catch (error) {
      throw new HttpException(
        error.message || `Failed to delete user with ID ${id}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private calculateProfileCompleteness(user: any): number {
    const fields = [
      user.parent_name,
      user.given_name,
      user.email,
      user.address,
      user.type,
      user.profile_picture
    ];

    const completedFields = fields.filter(field => field !== null && field !== undefined && field !== '').length;
    return Math.round((completedFields / fields.length) * 100);
  }
}