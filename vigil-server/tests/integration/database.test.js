const { PrismaClient } = require('@prisma/client');

// Skip if no database
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb('Database Integration', () => {
  let prisma;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Users', () => {
    it('should create a user', async () => {
      const user = await prisma.user.create({
        data: {
          tenantId: 'ws-test-01',
          email: `test-${Date.now()}@test.com`,
          name: 'Test User',
          role: 'OFFICER',
          status: 'ACTIVE'
        }
      });

      expect(user).toHaveProperty('id');
      expect(user.email).toContain('@test.com');

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should find users by tenant', async () => {
      const users = await prisma.user.findMany({
        where: { tenantId: 'ws-semarang-01' }
      });

      expect(Array.isArray(users)).toBe(true);
    });
  });

  describe('Vehicles', () => {
    it('should create a vehicle', async () => {
      const vehicle = await prisma.vehicle.create({
        data: {
          tenantId: 'ws-test-01',
          code: `TS-${Date.now()}`,
          name: 'Test Vehicle',
          type: 'BUS',
          lat: -6.9666,
          lng: 110.4196
        }
      });

      expect(vehicle).toHaveProperty('id');
      expect(vehicle.code).toMatch(/^TS-/);

      // Cleanup
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
    });
  });

  describe('Incidents', () => {
    it('should create an incident', async () => {
      const incident = await prisma.incident.create({
        data: {
          tenantId: 'ws-test-01',
          vehicleId: 'test-vehicle-id',
          officerId: 'test-officer-id',
          type: 'PANIC_BUTTON',
          severity: 'HIGH',
          lat: -6.9666,
          lng: 110.4196,
          description: 'Test incident'
        }
      });

      expect(incident).toHaveProperty('id');
      expect(incident.type).toBe('PANIC_BUTTON');

      // Cleanup
      await prisma.incident.delete({ where: { id: incident.id } });
    });
  });
});
