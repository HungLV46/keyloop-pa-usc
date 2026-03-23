# Keyloop Technical Assessment — Dealership Appointment Service

A production-grade MVP of a dealership service-booking backend, implementing a race-condition-safe appointment lifecycle with a three-layer double-booking defense strategy.

---

## Table of Contents

1. [Problem & Architecture](#1-problem--architecture)
2. [System Design Decisions](#2-system-design-decisions)
3. [Data Model](#3-data-model)
4. [Booking State Machine](#4-booking-state-machine)
5. [Three-Layer Defense Against Double-Booking](#5-three-layer-defense-against-double-booking)
6. [Technical Stack](#6-technical-stack)
7. [Project Structure](#7-project-structure)
8. [Getting Started](#8-getting-started)
9. [API Reference](#9-api-reference)
10. [Testing](#10-testing)
11. [AI Engineering & Verification Process](#11-ai-engineering--verification-process)
12. [Out-of-Scope Production Concerns](#12-out-of-scope-production-concerns)

---

## 1. Problem & Architecture

### The Core Problem

A dealership service department has a finite set of **service bays** and **qualified technicians**. Customers need to book time slots for vehicle service. The critical correctness risk is a **race condition**: two customers may see the same slot as available simultaneously and both attempt to claim it, causing a silent double-booking.

### Architecture Choice

The system is designed as a **domain-oriented microservices** architecture (see [ADR-001](docs/ADR-001-architecture-style.md)), even though the MVP implements a single service. This decision is driven by:

| Consideration              | Rationale                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Team size (100+ engineers) | Service-level ownership prevents cross-team coordination bottlenecks                  |
| Independent scalability    | The booking-critical path must scale independently of notifications and reporting     |
| Multi-tenant growth path   | `tenant_id` is on every entity from day one — no rearchitecting required              |
| Public API exposure        | Each service exposes a clean contract consumed by mobile apps and third-party portals |

### MVP Scope

For this assessment, the MVP implements one service:

- **Appointment Service** — full booking lifecycle: availability check, hold, confirm, cancel
- **Resource data** (dealerships, service bays, technicians, shifts, service types) is co-located within the same service for MVP simplicity, with a clear module boundary that maps to a future standalone `Resource Service`

---

## 2. System Design Decisions

Three Architecture Decision Records document the key choices:

| ADR                                                           | Decision                                                                       | Status   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| [ADR-001](docs/ADR-001-architecture-style.md)                 | Domain-oriented microservices over modular monolith                            | Accepted |
| [ADR-002](docs/ADR-002-simple-appointment-service.md)         | Four-state booking state machine with an explicit `HOLD` state                 | Accepted |
| [ADR-003](docs/ADR-003-simple-3layers-defense-booking-mvp.md) | Three-layer double-booking defense (revalidation + Redis lock + DB constraint) | Accepted |

### Why a Distributed Lock + Database Constraint?

A single control is insufficient:

- **Database constraint alone**: prevents the final write conflict but does not reduce unnecessary contention across API instances — every concurrent request fights to the last moment.
- **Redis lock alone**: a distributed lock can expire, be released incorrectly, or fail during a network partition. It cannot be the source of truth.
- **Application-level checks alone**: a point-in-time read is stale by the time the write executes.

The three layers address **different failure modes**. Correctness is maintained even if any one layer degrades.

---

## 3. Data Model

```
dealerships
  └── service_bays          (1:N)
  └── technicians           (1:N)
       └── technician_shifts (1:N, per weekday)

service_types               (tenant-scoped catalog)

appointments
  ├── dealership_id → dealerships
  ├── technician_id → technicians
  ├── service_bay_id → service_bays
  └── service_type_id → service_types
```

### Double-Booking Prevention at the Schema Level

The `appointments` table uses **PostgreSQL GiST exclusion constraints** — these are the authoritative last resort and cannot be bypassed by application bugs:

```sql
-- No two HOLD/CONFIRMED appointments may share the same bay in an overlapping time window
CONSTRAINT no_overlapping_bay
  EXCLUDE USING gist (
    service_bay_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status IN ('HOLD', 'CONFIRMED') AND service_bay_id IS NOT NULL),

-- Same guarantee for technicians
CONSTRAINT no_overlapping_technician
  EXCLUDE USING gist (
    technician_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status IN ('HOLD', 'CONFIRMED') AND technician_id IS NOT NULL)
```

> **Why not TypeORM `synchronize`?** TypeORM cannot generate `EXCLUDE USING gist` constraints. The schema is managed via a plain SQL migration (`migrations/001_initial_schema.sql`) that runs automatically when the Docker Compose stack starts.

---

## 4. Booking State Machine

([ADR-002](docs/ADR-002-simple-appointment-service.md))

```
          booking intent
               │
           [CREATED]
          /          \
    hold acquired   cancel
         │               │
       [HOLD] ──── cancel / TTL expiry ──► [CANCELLED]
         │
     user confirms
         │
    [CONFIRMED] ──── cancel ──► [CANCELLED]
```

| State       | Meaning                                                | Resource Allocation                      |
| ----------- | ------------------------------------------------------ | ---------------------------------------- |
| `CREATED`   | Booking intent exists; no reservation granted          | None                                     |
| `HOLD`      | Slot exclusively reserved; awaiting user commitment    | Bay + Technician reserved for TTL window |
| `CONFIRMED` | Durable appointment committed by user                  | Bay + Technician durably blocked         |
| `CANCELLED` | Terminal. Either explicit cancellation or hold timeout | No active reservation                    |

**Invalid transitions** (rejected by the service layer):

- `CREATED → CONFIRMED` — bypasses the concurrency safety window
- `CONFIRMED → HOLD` — demotes a committed reservation
- `CANCELLED → *` — terminal state; a new appointment aggregate must be created

---

## 5. Three-Layer Defense Against Double-Booking

([ADR-003](docs/ADR-003-simple-3layers-defense-booking-mvp.md))

```
Client ──► REST API ──► Booking Orchestrator
                              │
              ┌───────────────┼───────────────┐
              │               │               │
           [L1]            [L2]            [L3]
      Availability      Redis Lock       PostgreSQL
      Revalidation     (per slot)    Exclusion Constraint
      (PostgreSQL)
```

### Layer 1 — Availability Revalidation

Before any lock is attempted, the orchestrator re-queries PostgreSQL to confirm a qualified technician and service bay are still free for the exact requested window. This:

- Rejects stale-read attempts immediately (fast-fail before acquiring a lock)
- Narrows the critical section to requests with a realistic chance of succeeding

### Layer 2 — Redis Distributed Lock

A short-lived lock keyed on `(dealershipId, slotStart, bayId, technicianId)` serialises concurrent hold attempts across API instances. A Lua script performs atomic set-if-not-exists with TTL.

- Reduces duplicate writes during traffic spikes
- Expires automatically if the process crashes (prevents deadlock)
- **Not** the source of truth — it is a contention-reduction mechanism

### Layer 3 — PostgreSQL Exclusion Constraint

After acquiring the lock, the service writes the `HOLD` record. The database enforces the final no-overlap rule via the GiST exclusion constraints defined in the schema. If two requests bypass both L1 and L2, PostgreSQL rejects the losing write with a conflict error.

### End-to-End Hold Flow

```
1. Client submits hold request
2. L1: Re-query PostgreSQL — confirm technician + bay still free
3. If no pair available → 409 Conflict
4. L2: Acquire Redis lock for the slot claim
5. L3: Attempt to INSERT HOLD record in PostgreSQL
6. If INSERT succeeds → return HOLD + holdExpiresAt
7. If DB conflict → release lock → 409 Conflict
8. On confirm → verify TTL still valid → HOLD → CONFIRMED
9. On cancel / TTL expiry → HOLD → CANCELLED (releases capacity)
```

---

## 6. Technical Stack

| Concern           | Technology                          | Rationale                                                                       |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| Runtime           | Node.js 22 + TypeScript 5           | Type-safe, widely adopted in the ecosystem                                      |
| Framework         | NestJS 11                           | Dependency injection, module system, decorator-based validation                 |
| ORM               | TypeORM 0.3                         | Repository pattern; plain SQL migration for constraints TypeORM cannot generate |
| Primary store     | PostgreSQL 16                       | ACID transactions, GiST index support for range exclusion constraints           |
| Distributed lock  | Redis 7 / ioredis                   | Simple cross-instance coordination; automatic TTL-based expiry                  |
| Validation        | class-validator + class-transformer | Declarative DTO validation at the HTTP boundary                                 |
| API documentation | NestJS Swagger / OpenAPI            | Self-documenting; interactive Swagger UI at `/docs`                             |
| Hold expiry       | `@nestjs/schedule` (cron)           | Periodic background job to sweep expired HOLD records to CANCELLED              |
| Containerisation  | Docker Compose                      | One-command local environment with Postgres + Redis                             |

---

## 7. Project Structure

```
src/
├── main.ts                         # Bootstrap: global pipes, Swagger, CORS
├── app.module.ts                   # Root module
├── common/
│   ├── decorators/
│   │   └── current-user.decorator.ts   # Extracts x-customer-id / x-tenant-id headers
│   └── filters/
│       └── http-exception.filter.ts    # Standardised error envelope
├── database/
│   ├── database.module.ts          # TypeORM + PostgreSQL connection
│   └── redis.provider.ts           # ioredis singleton injection token
└── modules/
    ├── appointment/                # Core booking domain
    │   ├── appointment.controller.ts   # HTTP endpoints
    │   ├── appointment.service.ts      # Booking orchestrator (L1/L2/L3 defense)
    │   ├── appointment.repository.ts   # TypeORM data access
    │   ├── resource.repository.ts      # Read-only resource queries
    │   ├── appointment-status.enum.ts  # CREATED | HOLD | CONFIRMED | CANCELLED
    │   ├── dto/                        # CheckAvailability, CreateAppointment, AvailableSlot
    │   └── entities/
    │       └── appointment.entity.ts
    └── resource/                   # Master data (bounded context)
        ├── entities/               # Dealership, ServiceBay, Technician, Shift, ServiceType
        ├── services/
        │   └── resource.service.ts
        └── controllers/
            └── resource.controller.ts

migrations/
└── 001_initial_schema.sql          # Full schema including GiST exclusion constraints

docs/
├── ADR-001-architecture-style.md
├── ADR-002-simple-appointment-service.md
└── ADR-003-simple-3layers-defense-booking-mvp.md
```

---

## 8. Getting Started

### Prerequisites

- Docker + Docker Compose
- Node.js 22+
- npm

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL 16 (port 5432) and Redis 7 (port 6379). The migration `001_initial_schema.sql` runs automatically on the first start.

### 2. Configure Environment

```bash
cp .env.example .env   # if provided, otherwise set variables directly
```

Key environment variables:

| Variable           | Default                  | Description                                     |
| ------------------ | ------------------------ | ----------------------------------------------- |
| `PORT`             | `3000`                   | HTTP server port                                |
| `DB_HOST`          | `localhost`              | PostgreSQL host                                 |
| `DB_PORT`          | `5432`                   | PostgreSQL port                                 |
| `DB_USERNAME`      | `postgres`               | PostgreSQL user                                 |
| `DB_PASSWORD`      | `postgres`               | PostgreSQL password                             |
| `DB_NAME`          | `keyloop_appointments`   | Database name                                   |
| `REDIS_URL`        | `redis://localhost:6379` | Redis connection string                         |
| `HOLD_TTL_MINUTES` | `5`                      | Minutes before an unconfirmed HOLD auto-expires |

### 3. Install Dependencies & Run

```bash
npm install
npm run start:dev
```

The service starts on `http://localhost:3000`.

### 4. Explore the API

Open **http://localhost:3000/docs** for the interactive Swagger UI.

Use the `x-tenant-id` and `x-customer-id` header fields to authenticate (auth stub — see [API Reference](#9-api-reference)).

---

## 9. API Reference

All endpoints are prefixed with `/v1`.

### Authentication Stub

In production, an API Gateway validates a Cognito JWT and injects `x-customer-id` and `x-tenant-id` headers. For MVP, pass these headers directly.

### Endpoints

#### `GET /v1/appointments/availability`

Returns all available time slots for a given dealership, service type, and date. Each slot is guaranteed to have at least one free service bay and one qualified technician.

| Query Param     | Type         | Required | Description       |
| --------------- | ------------ | -------- | ----------------- |
| `dealershipId`  | UUID         | Yes      | Target dealership |
| `serviceTypeId` | UUID         | Yes      | Type of service   |
| `date`          | `YYYY-MM-DD` | Yes      | Requested date    |

**Response** `200 OK`

```json
[{ "slotStart": "2026-04-07T08:00:00.000Z", "slotEnd": "2026-04-07T09:00:00.000Z", "available": true }]
```

---

#### `POST /v1/appointments`

Creates an appointment in `HOLD` state using the three-layer defense. Automatically selects the earliest available slot on the requested date.

**Request body**

```json
{
  "dealershipId": "uuid",
  "vehicleId": "uuid",
  "serviceTypeId": "uuid",
  "slotStartTime": "2026-04-07T09:00:00Z"
}
```

**Response** `201 Created`

```json
{
  "id": "uuid",
  "status": "HOLD",
  "holdExpiresAt": "2026-04-07T09:05:00.000Z",
  "technicianId": "uuid",
  "serviceBayId": "uuid",
  ...
}
```

**Error responses**

| Status | Meaning                              |
| ------ | ------------------------------------ |
| `404`  | Dealership or service type not found |
| `409`  | No availability — all slots taken    |

---

#### `POST /v1/appointments/:id/confirm`

Transitions `HOLD → CONFIRMED`. Returns `410 Gone` if the hold TTL has expired.

**Error responses**

| Status | Meaning                          |
| ------ | -------------------------------- |
| `400`  | Appointment is not in HOLD state |
| `404`  | Appointment not found            |
| `410`  | Hold expired — select a new slot |

---

#### `DELETE /v1/appointments/:id`

Cancels a `HOLD` or `CONFIRMED` appointment. Idempotent on already-cancelled records returns `400`.

**Response** `204 No Content`

---

### HTTP Workbook

A ready-to-use HTTP request file is available at [http/appointments.http](http/appointments.http) for use with the VS Code REST Client extension.

---

## 10. Testing

### Unit Tests

```bash
npm test
```

Tests live alongside the source files (`*.spec.ts`). The test suite uses Jest with `ts-jest` and covers:

- **`AppointmentService`** — all lifecycle transitions, error paths (slot unavailable, hold expired, invalid transitions), Redis lock acquisition and fallthrough, and the cron expiry job
- **`AppointmentRepository`** — query construction and conflict detection
- **`AppointmentController`** — HTTP mapping and decorator extraction
- **`ResourceService`** — resource creation and validation

All external dependencies (PostgreSQL, Redis) are mocked. Tests are deterministic and run without infrastructure.

### Test Coverage

```bash
npm run test:cov
```

### E2E Tests

```bash
# Requires the Docker Compose stack to be running
npm run test:e2e
```

---

## 11. AI Engineering & Verification Process

This project was developed with GitHub Copilot as a pair-programming assistant. The following describes how AI was directed and how every AI-generated output was verified before being committed.

### Strategy for Directing AI

AI assistance was applied in layers, matching the complexity of the task:

1. **Architecture and ADRs first** — the three ADRs were drafted before any implementation began. AI was used to stress-test design reasoning (e.g., "what failure modes does a Redis-only approach miss?"), not to generate the decisions themselves.

2. **Scaffolding over generation** — For repetitive but predictable code (DTO definitions, entity decorators, module wiring), Copilot suggestions were accepted with light review. For the booking orchestrator (`appointment.service.ts`) and schema constraints (`001_initial_schema.sql`), each suggestion was evaluated against the ADR contract.

3. **Prompt specificity** — Prompts were scoped to single concerns: "implement the Redis Lua setnx with TTL" rather than "implement the booking service". Narrow prompts produce verifiable outputs.

### Verification Process

Every AI-generated output went through the following checks before acceptance:

| Concern                    | Verification Method                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Business logic correctness | Manual trace of all state machine transitions against ADR-002 transition table                                               |
| Concurrency safety         | Checked that L1 → L2 → L3 ordering was preserved; confirmed lock key scope was slot-specific, not dealership-wide            |
| Schema constraints         | Reviewed the GiST exclusion constraint SQL against PostgreSQL documentation; confirmed `btree_gist` extension is required    |
| Error HTTP codes           | Mapped each thrown exception (`ConflictException`, `GoneException`, `NotFoundException`) to the correct semantic HTTP status |
| Test completeness          | Reviewed each spec file to confirm both happy path and all documented invalid transitions were covered                       |
| Security                   | Confirmed `tenant_id` filtering on all resource queries; no cross-tenant data leakage                                        |

### Bugs Found and Fixed During Verification

- **Stale slot generation**: an early AI draft generated slot windows in UTC regardless of dealership timezone. Fixed by converting slot boundaries using `date-fns-tz/fromZonedTime` and resolving the day-of-week in the dealership's local timezone (noon-UTC anchor to avoid date boundary edge cases).
- **Lock key collision**: initial lock key was scoped to `(dealershipId, slotStart)` — too broad, causing unnecessary serialisation across unrelated resource pairs. Corrected to include `bayId` and `technicianId`.
- **Missing partial index**: the hold-expiry cron job performs a `WHERE status = 'HOLD'` scan. The migration was missing the partial index `idx_appointments_hold_expiry`; added after reviewing the query plan.

---

## 12. Out-of-Scope Production Concerns

The following are real production requirements deliberately excluded from this demo scope. They are called out explicitly to demonstrate architectural awareness.

| Area                       | What's Missing                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| **CI/CD**                  | No deployment pipeline, staging environments, canary or blue/green strategy              |
| **Service mesh**           | No mutual TLS, retry policy, circuit-breaker, or traffic shaping between services        |
| **Secret management**      | Credentials are environment variables; no AWS Secrets Manager rotation or HSM binding    |
| **Infrastructure as Code** | No Terraform, CDK, or CloudFormation templates for RDS, ElastiCache, ECS, or API Gateway |
| **Disaster recovery**      | No RTO/RPO targets, cross-region replication, or automated backup strategy               |
| **Compliance**             | No GDPR right-to-erasure, data portability, or audit log retention policy                |
| **API versioning**         | No URI versioning scheme or deprecation policy beyond the `/v1` prefix                   |
| **Observability**          | No distributed tracing (X-Ray/OpenTelemetry), structured log shipping, or alerting       |
| **Load/chaos testing**     | No performance baselines, k6 load plans, or fault injection scenarios                    |
| **Idempotency**            | Duplicate hold requests from the same customer are not deduplicated in the MVP           |

---

## License

Private — Keyloop Technical Assessment. Not for redistribution.
