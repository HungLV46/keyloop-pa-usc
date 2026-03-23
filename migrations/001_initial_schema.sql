-- ============================================================
-- Migration: 001_initial_schema
-- Appointment Service — Keyloop TA
-- Run this in production instead of TypeORM synchronize.
-- TypeORM synchronize cannot generate EXCLUDE USING gist constraints.
-- ============================================================

-- Required extension for range exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Dealerships ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dealerships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  name            VARCHAR(255) NOT NULL,
  timezone        VARCHAR(64) NOT NULL DEFAULT 'UTC',
  operating_hours JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealerships_tenant ON dealerships(tenant_id) WHERE is_active = true;

-- ── Service Types ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  name            VARCHAR(255) NOT NULL,
  duration_min    INT NOT NULL CHECK (duration_min > 0),
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Service Bays ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_bays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id   UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_bays_dealership ON service_bays(dealership_id) WHERE is_active = true;

-- ── Technicians ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technicians (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id   UUID NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  skills          TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_technicians_dealership ON technicians(dealership_id) WHERE is_active = true;

-- ── Technician Shifts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technician_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id   UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Monday
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  CHECK (end_time > start_time)
);

-- ── Appointments ──────────────────────────────────────────────
CREATE TYPE appointment_status AS ENUM ('CREATED', 'HOLD', 'CONFIRMED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  dealership_id   UUID NOT NULL,
  customer_id     UUID NOT NULL,
  vehicle_id      UUID NOT NULL,
  technician_id   UUID REFERENCES technicians(id),
  service_bay_id  UUID REFERENCES service_bays(id),
  service_type_id UUID NOT NULL,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'CREATED',
  hold_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_time > start_time),

  -- ──────────────────────────────────────────────────────────
  -- Layer 3 defense: hard database guarantee against double-booking.
  -- These constraints fire on every INSERT/UPDATE of a HOLD or CONFIRMED row.
  -- Even if the Redis lock (L2) or the application re-check (L1) fails,
  -- PostgreSQL will reject overlapping reservations here.
  -- ──────────────────────────────────────────────────────────
  CONSTRAINT no_overlapping_bay
    EXCLUDE USING gist (
      service_bay_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('HOLD', 'CONFIRMED') AND service_bay_id IS NOT NULL),

  CONSTRAINT no_overlapping_technician
    EXCLUDE USING gist (
      technician_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('HOLD', 'CONFIRMED') AND technician_id IS NOT NULL)
);

-- Performance indexes for availability queries
CREATE INDEX idx_appointments_bay_time_status
  ON appointments(service_bay_id, start_time, status)
  WHERE status IN ('HOLD', 'CONFIRMED');

CREATE INDEX idx_appointments_tech_time_status
  ON appointments(technician_id, start_time, status)
  WHERE status IN ('HOLD', 'CONFIRMED');

CREATE INDEX idx_appointments_customer
  ON appointments(customer_id, tenant_id, start_time DESC);

-- Partial index for the hold-expiry background job
CREATE INDEX idx_appointments_hold_expiry
  ON appointments(hold_expires_at)
  WHERE status = 'HOLD';
