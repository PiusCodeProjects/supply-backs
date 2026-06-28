import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterContractorDto } from './dto/register-contractor.dto';
import { RegisterSupplierDto } from './dto/register-supplier.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload, AuthTokens } from '@cscp/types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private normalizePhone(phone: string): string {
    if (!phone) return phone;
    const clean = phone.replace(/\s+/g, '');
    if (clean.startsWith('0') && clean.length === 10) {
      return '+233' + clean.substring(1);
    }
    return clean;
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    // Store refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private async createAndSendOtp(
    userId: string,
    purpose: 'PHONE_VERIFY' | 'PASSWORD_RESET',
  ) {
    // Invalidate old OTPs
    await this.prisma.otpToken.updateMany({
      where: { userId, purpose, used: false },
      data: { used: true },
    });

    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.prisma.otpToken.create({
      data: { userId, code, purpose, expiresAt },
    });

    // In production: send SMS via Twilio
    // For dev: log to console
    console.log(`\n📱 OTP [${purpose}] for user ${userId}: ${code}\n`);

    return { userId };
  }

  // ─── Register Contractor ───────────────────────────────────────────────────

  async registerContractor(dto: RegisterContractorDto) {
    const phone = this.normalizePhone(dto.phone);
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone }] },
    });
    if (exists) throw new ConflictException('Email or phone already registered');

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone,
        passwordHash,
        role: 'CONTRACTOR',
        status: 'ACTIVE',
        isVerified: false,
        contractorProfile: {
          create: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            company: dto.company,
          },
        },
      },
    });

    return this.createAndSendOtp(user.id, 'PHONE_VERIFY');
  }

  // ─── Register Supplier ────────────────────────────────────────────────────

  async registerSupplier(dto: RegisterSupplierDto, documentPaths: string[], storePhotoPaths: string[] = []) {
    const phone = this.normalizePhone(dto.phone);
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone }] },
    });
    if (exists) throw new ConflictException('Email or phone already registered');

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone,
        passwordHash,
        role: 'SUPPLIER',
        status: 'PENDING_VERIFICATION',
        isVerified: false,
        supplierProfile: {
          create: {
            businessName: dto.businessName,
            verificationStatus: 'PENDING',
            documents: JSON.stringify(documentPaths),
            storePhotos: JSON.stringify(storePhotoPaths),
          },
        },
      },
    });

    return this.createAndSendOtp(user.id, 'PHONE_VERIFY');
  }

  // ─── Register Driver (by admin/supplier) ──────────────────────────────────

  async registerDriver(dto: RegisterDriverDto, requester?: JwtPayload) {
    const assignedSupplierId = requester?.role === 'SUPPLIER' ? requester.sub : dto.assignedSupplierId;
    if (!assignedSupplierId) throw new BadRequestException('Assigned supplier is required');

    const phone = this.normalizePhone(dto.phone);
    const existingUser = await this.prisma.user.findFirst({
      where: { phone },
      include: { driverProfile: true },
    });

    if (existingUser) {
      if (existingUser.role !== 'DRIVER') {
        throw new ConflictException('This phone number is registered with a different role.');
      }

      // Check if already linked
      const linkage = await this.prisma.supplierDriver.findUnique({
        where: { supplierId_driverId: { supplierId: assignedSupplierId, driverId: existingUser.id } },
      });

      if (linkage) {
        throw new ConflictException('This driver is already in your fleet.');
      }

      // Link to supplier
      await this.prisma.supplierDriver.create({
        data: { supplierId: assignedSupplierId, driverId: existingUser.id },
      });

      // Update profile if provided (optional, user said "supplier can view and update")
      await this.prisma.driverProfile.update({
        where: { userId: existingUser.id },
        data: {
          firstName: dto.firstName || existingUser.driverProfile?.firstName,
          lastName: dto.lastName || existingUser.driverProfile?.lastName,
          licenseNo: dto.licenseNo || existingUser.driverProfile?.licenseNo,
        },
      });

      return {
        userId: existingUser.id,
        phone: existingUser.phone,
        message: 'Existing driver linked to your fleet.',
      };
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        phone,
        passwordHash,
        role: 'DRIVER',
        status: 'ACTIVE',
        isVerified: true,
        driverProfile: {
          create: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            licenseNo: dto.licenseNo,
          },
        },
        supplierDrivers: {
          create: { supplierId: assignedSupplierId },
        },
      },
    });

    return {
      userId: user.id,
      phone: user.phone,
      message: 'New driver account created and linked to your fleet.',
    };
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

  async verifyOtp(userId: string, code: string) {
    const otp = await this.prisma.otpToken.findFirst({
      where: {
        userId,
        code,
        purpose: 'PHONE_VERIFY',
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP');

    await this.prisma.otpToken.update({
      where: { id: otp.id },
      data: { used: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });

    return { message: 'Phone verified successfully' };
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────

  async resendOtp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new BadRequestException('Phone already verified');
    return this.createAndSendOtp(userId, 'PHONE_VERIFY');
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const identifier = this.normalizePhone(dto.identifier);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await this.comparePassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account suspended. Contact support.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role as any,
      isVerified: user.isVerified,
    };

    const tokens = await this.issueTokens(payload);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        status: user.status,
      },
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { message: 'Logged out successfully' };
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete old refresh token
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const payload: JwtPayload = {
      sub: stored.user.id,
      email: stored.user.email,
      phone: stored.user.phone,
      role: stored.user.role as any,
      isVerified: stored.user.isVerified,
    };

    return this.issueTokens(payload);
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────

  async forgotPassword(identifierInput: string) {
    const identifier = this.normalizePhone(identifierInput);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });

    // Always return success to prevent user enumeration
    if (!user) return { userId: null, message: 'If account exists, OTP sent' };

    await this.createAndSendOtp(user.id, 'PASSWORD_RESET');
    return { userId: user.id, message: 'OTP sent to your registered phone/email' };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const otp = await this.prisma.otpToken.findFirst({
      where: {
        userId: dto.userId,
        code: dto.code,
        purpose: 'PASSWORD_RESET',
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP');

    await this.prisma.otpToken.update({
      where: { id: otp.id },
      data: { used: true },
    });

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { passwordHash },
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await this.comparePassword(oldPass, user.passwordHash);
    if (!valid) throw new BadRequestException('Incorrect old password');

    const passwordHash = await this.hashPassword(newPass);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
  }
}
