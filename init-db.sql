-- VigilOS - Database Initialization
-- Only create user and database. Tables/enums handled by Prisma.

-- Create user
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vigil_admin') THEN
    CREATE ROLE vigil_admin WITH LOGIN PASSWORD 'changeme';
  END IF;
END
$$;

-- Create database
SELECT 'CREATE DATABASE vigil_prod OWNER vigil_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vigil_prod')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE vigil_prod TO vigil_admin;
