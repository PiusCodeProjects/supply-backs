import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { AuthService } from './auth.service';
import { RegisterContractorDto } from './dto/register-contractor.dto';
import { RegisterSupplierDto } from './dto/register-supplier.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto, ResendOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from '@cscp/types';

const documentStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'documents'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const prefix = file.fieldname === 'storePhotos' ? 'store-' : 'doc-';
    cb(null, `${prefix}${unique}${extname(file.originalname)}`);
  },
});

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Registration ─────────────────────────────────────────────────────────

  @Post('register/contractor')
  registerContractor(@Body() dto: RegisterContractorDto) {
    return this.authService.registerContractor(dto);
  }

  @Post('register/supplier')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'documents', maxCount: 5 },
        { name: 'storePhotos', maxCount: 10 },
      ],
      { storage: documentStorage },
    ),
  )
  registerSupplier(
    @Body() dto: RegisterSupplierDto,
    @UploadedFiles()
    files: { documents?: Express.Multer.File[]; storePhotos?: Express.Multer.File[] },
  ) {
    const docPaths = (files?.documents || []).map((f) => `/uploads/documents/${f.filename}`);
    const photoPaths = (files?.storePhotos || []).map((f) => `/uploads/documents/${f.filename}`);
    return this.authService.registerSupplier(dto, docPaths, photoPaths);
  }

  @Post('register/driver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPPLIER')
  registerDriver(@CurrentUser() user: JwtPayload, @Body() dto: RegisterDriverDto) {
    return this.authService.registerDriver(dto, user);
  }

  // ─── OTP ──────────────────────────────────────────────────────────────────

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.userId, dto.code);
  }

  @Post('resend-otp')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.userId);
  }

  // ─── Session ──────────────────────────────────────────────────────────────

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // ─── Password Reset ───────────────────────────────────────────────────────

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.identifier);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─── Health / Me ──────────────────────────────────────────────────────────

  @Post('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return { user };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: any) {
    return this.authService.changePassword(user.sub, dto.oldPassword, dto.newPassword);
  }
}
