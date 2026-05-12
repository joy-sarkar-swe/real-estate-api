import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const db = this.prisma as any;
    const existing = await db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await db.user.create({
      data: {
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        phone: dto.phone,
        role: dto.role ?? UserRole.TENANT,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    this.logger.log(`New user registered: ${user.email}`);
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { user, ...tokens };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const db = this.prisma as any;
    const user = await db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === UserStatus.BANNED)
      throw new UnauthorizedException('Account is banned');

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      ipAddress,
      userAgent,
    );
    this.logger.log(`User logged in: ${user.email}`);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      ...tokens,
    };
  }

  async refreshTokens(
    dto: RefreshTokenDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const db = this.prisma as any;
    const stored = await db.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || dayjs().isAfter(stored.expiresAt)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      ipAddress,
      userAgent,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    await (this.prisma as any).refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const db = this.prisma as any;
    const user = await db.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user)
      return { message: 'If that email exists, a reset link was sent' };

    const token = uuidv4();
    const expiresAt = dayjs().add(1, 'hour').toDate();
    await db.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });
    this.logger.log(`Password reset token generated for ${user.email}`);
    return { message: 'If that email exists, a reset link was sent', token };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const db = this.prisma as any;
    const reset = await db.passwordReset.findUnique({
      where: { token: dto.token },
    });
    if (!reset || reset.usedAt || dayjs().isAfter(reset.expiresAt)) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(dto.password);
    await (this.prisma as any).$transaction([
      db.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      db.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      db.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const db = this.prisma as any;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const isValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isValid)
      throw new BadRequestException('Current password is incorrect');

    const passwordHash = await argon2.hash(dto.newPassword);
    await db.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully' };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = (this.jwtService as any).sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    });

    const refreshTokenValue = uuidv4();
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    const days = parseInt(refreshExpiresIn.replace('d', ''), 10);
    const expiresAt = dayjs().add(days, 'day').toDate();

    await (this.prisma as any).refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    };
  }
}
