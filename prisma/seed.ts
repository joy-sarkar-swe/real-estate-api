import { PrismaClient, UserRole, UserStatus, PropertyType, BhkType, FurnishingType, PropertyStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // Admin user
  const adminPassword = await argon2.hash('Admin@12345');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@realestate.com' },
    update: {},
    create: {
      email: 'admin@realestate.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  // Owner user
  const ownerPassword = await argon2.hash('Owner@12345');
  const owner = await prisma.user.upsert({
    where: { email: 'owner@realestate.com' },
    update: {},
    create: {
      email: 'owner@realestate.com',
      firstName: 'Rahim',
      lastName: 'Owner',
      passwordHash: ownerPassword,
      phone: '+8801712345678',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  // Tenant user
  const tenantPassword = await argon2.hash('Tenant@12345');
  const tenant = await prisma.user.upsert({
    where: { email: 'tenant@realestate.com' },
    update: {},
    create: {
      email: 'tenant@realestate.com',
      firstName: 'Karim',
      lastName: 'Tenant',
      passwordHash: tenantPassword,
      phone: '+8801898765432',
      role: UserRole.TENANT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  // Sample properties
  await prisma.property.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Luxury 3BHK Apartment in Gulshan 2',
        description: 'Spacious fully furnished apartment with panoramic views. Modern kitchen, 3 bathrooms, backup generator, 24/7 security.',
        price: 55000,
        securityDeposit: 110000,
        bhkType: BhkType.THREE_BHK,
        propertyType: PropertyType.APARTMENT,
        furnishingType: FurnishingType.FULLY_FURNISHED,
        status: PropertyStatus.AVAILABLE,
        isVerified: true,
        address: 'House 45, Road 11, Gulshan 2',
        city: 'Dhaka',
        state: 'Dhaka Division',
        pincode: '1212',
        latitude: 23.7938,
        longitude: 90.4162,
        area: 2100,
        floor: 8,
        totalFloors: 12,
        isPetFriendly: false,
        hasParking: true,
        availableFrom: new Date('2024-02-01'),
        amenities: ['WiFi', 'AC', 'Gym', 'Swimming Pool', 'Lift', 'Generator'],
        images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'],
        ownerId: owner.id,
      },
      {
        id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        title: 'Cozy 2BHK in Dhanmondi',
        description: 'Semi-furnished apartment near Rabindra Sarobar Lake. Quiet neighborhood, great for families.',
        price: 28000,
        securityDeposit: 56000,
        bhkType: BhkType.TWO_BHK,
        propertyType: PropertyType.APARTMENT,
        furnishingType: FurnishingType.SEMI_FURNISHED,
        status: PropertyStatus.AVAILABLE,
        isVerified: true,
        address: 'Road 27, Dhanmondi',
        city: 'Dhaka',
        state: 'Dhaka Division',
        pincode: '1209',
        latitude: 23.7461,
        longitude: 90.3742,
        area: 1200,
        floor: 4,
        totalFloors: 8,
        isPetFriendly: true,
        hasParking: true,
        availableFrom: new Date('2024-01-15'),
        amenities: ['WiFi', 'AC', 'Lift'],
        images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'],
        ownerId: owner.id,
      },
    ],
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Test accounts:');
  console.log('  Admin:  admin@realestate.com / Admin@12345');
  console.log('  Owner:  owner@realestate.com / Owner@12345');
  console.log('  Tenant: tenant@realestate.com / Tenant@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
