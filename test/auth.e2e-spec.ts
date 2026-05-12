import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E tests — requires a real PostgreSQL + Redis connection.
 * Run with: docker-compose -f docker-compose.dev.yml up -d && npm run test:e2e
 *
 * Tests use a test database (set TEST_DATABASE_URL in .env.test)
 */
describe('Auth E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: `e2e-test-${Date.now()}@example.com`,
    password: 'StrongPass@123',
    firstName: 'E2E',
    lastName: 'Test',
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test user
    await (prisma as any).user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });

  // ── POST /auth/register ────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('201 — should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testUser.email);

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('409 — should reject duplicate registration', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('400 — should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'weak@test.com', password: '123' })
        .expect(400);
    });

    it('400 — should reject invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'not-an-email' })
        .expect(400);
    });
  });

  // ── POST /auth/login ───────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('200 — should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('401 — should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPass@999' })
        .expect(401);
    });

    it('401 — should reject unknown email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'StrongPass@123' })
        .expect(401);
    });
  });

  // ── POST /auth/refresh ─────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('200 — should issue new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data).toHaveProperty('accessToken');
      // Update tokens
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('401 — should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'fake-token' })
        .expect(401);
    });
  });

  // ── GET /users/me ──────────────────────────────────────────────────

  describe('GET /api/v1/users/me', () => {
    it('200 — should return current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.email).toBe(testUser.email);
    });

    it('401 — should reject without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('401 — should reject with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });

  // ── POST /auth/forgot-password ─────────────────────────────────────

  describe('POST /api/v1/auth/forgot-password', () => {
    it('200 — should return safe message for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'no-such@example.com' })
        .expect(200);

      expect(res.body.data.message).toContain('If that email exists');
    });

    it('200 — should return token for known email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200);

      expect(res.body.data).toHaveProperty('token');
    });
  });

  // ── POST /auth/logout ──────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('200 — should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);
    });

    it('401 — should reject after logout (refreshToken revoked)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });
});
