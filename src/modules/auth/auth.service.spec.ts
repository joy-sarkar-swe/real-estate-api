import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as argon2 from 'argon2';

const mockPrisma = {
  user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  passwordReset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn().mockResolvedValue([]),
};

const mockJwtService = { sign: jest.fn().mockReturnValue('mock.access.token') };

const mockConfigService = {
  get: (key: string, def?: any) => ({
    'jwt.accessSecret': 'test-secret',
    'jwt.refreshSecret': 'test-refresh',
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshExpiresIn': '7d',
  }[key] ?? def),
};

const baseUser = {
  id: 'user-1', email: 'test@example.com', firstName: 'Test',
  lastName: 'User', role: 'TENANT', status: 'ACTIVE', passwordHash: '',
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new (AuthService as any)(mockPrisma, mockJwtService, mockConfigService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(baseUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({ email: 'new@test.com', firstName: 'A', lastName: 'B', password: 'Pass@123' } as any);

      expect(result).toHaveProperty('accessToken', 'mock.access.token');
      expect(result).toHaveProperty('user');
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.register({ email: 'test@example.com', password: 'P' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const hash = await argon2.hash('StrongPass@123');
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: 'test@example.com', password: 'StrongPass@123' });
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'p' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await argon2.hash('CorrectPass@1');
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash });
      await expect(service.login({ email: 'test@example.com', password: 'Wrong@Pass1' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for banned user', async () => {
      const hash = await argon2.hash('Pass@123');
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash, status: 'BANNED' });
      await expect(service.login({ email: 'test@example.com', password: 'Pass@123' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout('rt-token');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'rt-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('forgotPassword', () => {
    it('should return safe message for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'ghost@x.com' });
      expect(result.message).toContain('If that email exists');
      expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
    });

    it('should create reset token for known user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.passwordReset.create.mockResolvedValue({ token: 'tok' });
      const result = await service.forgotPassword({ email: 'test@example.com' });
      expect(result).toHaveProperty('token');
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException for expired token', async () => {
      mockPrisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr-1', userId: 'u-1', usedAt: null, expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.resetPassword({ token: 'tok', password: 'NewPass@1' })).rejects.toThrow(BadRequestException);
    });

    it('should reset password on valid token', async () => {
      mockPrisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr-1', userId: 'u-1', usedAt: null, expiresAt: new Date(Date.now() + 3600000),
      });
      mockPrisma.$transaction.mockResolvedValue([]);
      const result = await service.resetPassword({ token: 'valid', password: 'NewPass@1' });
      expect(result.message).toContain('reset successful');
    });
  });

  describe('changePassword', () => {
    it('should throw BadRequestException for wrong current password', async () => {
      const hash = await argon2.hash('CurrentPass@1');
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, passwordHash: hash });
      await expect(service.changePassword('u-1', { currentPassword: 'WrongPass@1', newPassword: 'NewPass@1' })).rejects.toThrow(BadRequestException);
    });

    it('should update password on correct current password', async () => {
      const hash = await argon2.hash('CurrentPass@1');
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, passwordHash: hash });
      mockPrisma.user.update.mockResolvedValue(baseUser);
      const result = await service.changePassword('u-1', { currentPassword: 'CurrentPass@1', newPassword: 'NewPass@1' });
      expect(result.message).toContain('changed');
    });
  });
});
