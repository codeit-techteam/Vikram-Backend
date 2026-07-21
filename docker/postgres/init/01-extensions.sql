-- Bajriwala ERP — PostgreSQL initialization
-- Runs once on first container startup (empty volume only)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
