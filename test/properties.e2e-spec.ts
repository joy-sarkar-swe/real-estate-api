import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Properties E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let ownerToken: string;
  let tenantToken: string;
  let adminToken: string;
  let createdPropertyId: string;

  const ownerUser = { email: `e2e-owner-${Date.now()}@test.com`, password: 'Owner@12345', firstName: 'E2E', lastName: 'Owner', role: 'OWNER' };
  const tenantUser = { email: `e2e-tenant-${Date.now()}@test.com`, password: 'Tenant@12345', firstName: 'E2E', lastName: 'Tenant' };

  const validProperty = {
    title: 'E2E Test Apartment',
    description: 'A beautiful apartment for testing purposes',
    price: 28000,
    securityDeposit: 56000,
    bhkType: 'TWO_BHK',
    propertyType: 'APARTMENT',
    furnishingType: 'SEMI_FURNISHED',
    address: 'Road 10, Gulshan 1',
    city: 'Dhaka',
    state: 'Dhaka Division',
    pincode: '1212',
    latitude: 23.7938,
    longitude: 90.4162,
    area: 1200,
    floor: 3,
    totalFloors: 8,
    isPetFriendly: false,
    hasParking: true,
    availableFrom: '2025-03-01',
    amenities: ['WiFi', 'AC'],
    images: [],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Register & login owner
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(ownerUser);
    ownerToken = ownerRes.body.data.accessToken;

    // Register & login tenant
    const tenantRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(tenantUser);
    tenantToken = tenantRes.body.data.accessToken;
  });

  afterAll(async () => {
    await (prisma as any).property.deleteMany({ where: { title: validProperty.title } });
    await (prisma as any).user.deleteMany({ where: { email: { in: [ownerUser.email, tenantUser.email] } } });
    await app.close();
  });

  // ── POST /properties ───────────────────────────────────────────────

  describe('POST /api/v1/properties', () => {
    it('201 — owner can create a property', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validProperty)
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe(validProperty.title);
      createdPropertyId = res.body.data.id;
    });

    it('403 — tenant cannot create a property', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(validProperty)
        .expect(403);
    });

    it('401 — unauthenticated cannot create a property', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/properties')
        .send(validProperty)
        .expect(401);
    });

    it('400 — should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Incomplete' })
        .expect(400);
    });
  });

  // ── GET /properties/search ─────────────────────────────────────────

  describe('GET /api/v1/properties/search', () => {
    it('200 — public search returns paginated results', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/search?city=Dhaka&limit=5')
        .expect(200);

      expect(res.body.data).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('meta');
      expect(res.body.data.meta).toHaveProperty('total');
    });

    it('200 — search with price range', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/search?minPrice=20000&maxPrice=35000')
        .expect(200);

      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    it('200 — search with geo coordinates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/search?lat=23.7938&lng=90.4162&radiusKm=5')
        .expect(200);

      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    it('200 — search with bhkType filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/search?bhkType=TWO_BHK')
        .expect(200);

      expect(Array.isArray(res.body.data.data)).toBe(true);
    });
  });

  // ── GET /properties/:id ────────────────────────────────────────────

  describe('GET /api/v1/properties/:id', () => {
    it('200 — public access to property detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/properties/${createdPropertyId}`)
        .expect(200);

      expect(res.body.data.id).toBe(createdPropertyId);
      expect(res.body.data).toHaveProperty('owner');
      expect(res.body.data).toHaveProperty('priceHistory');
    });

    it('404 — should return 404 for unknown id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/properties/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ── PATCH /properties/:id ──────────────────────────────────────────

  describe('PATCH /api/v1/properties/:id', () => {
    it('200 — owner can update their property', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Updated E2E Title' })
        .expect(200);

      expect(res.body.data.title).toBe('Updated E2E Title');
    });

    it('403 — tenant cannot update another owner property', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });
  });

  // ── GET /properties/my-listings ────────────────────────────────────

  describe('GET /api/v1/properties/my-listings', () => {
    it('200 — owner sees their listings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties/my-listings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((p: any) => p.id === createdPropertyId)).toBe(true);
    });
  });

  // ── DELETE /properties/:id ─────────────────────────────────────────

  describe('DELETE /api/v1/properties/:id', () => {
    it('200 — owner can soft-delete their property', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/properties/${createdPropertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.message).toContain('deleted');
    });

    it('404 — deleted property not found in search', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/properties/${createdPropertyId}`)
        .expect(404);
    });
  });
});
