# ADR-001: Architecture Style — Domain-Oriented Microservices

**Status**: Accepted  
**Date**: 2026-03-22  
**Deciders**: Solution Architect

---

## Context

**Assumptions:**

- Greenfield application: designing a dealership service appointment booking system from scratch
- Medium tech team size: 100+ engineers, implying multiple squads working in parallel
- Multi-tenant growth path: MVP is a single dealership, but the system must scale toward a multi-tenant network
- Open to integrations: The system must expose a public API consumed by mobile apps and third-party portals
- The core booking domain has strong transactional requirements (resource constraints must be enforced with hard consistency)

We evaluated three architecture styles:

| Style                             | Pros                                                                                                                                         | Cons                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monolith**                      | Simple to build and deploy initially                                                                                                         | Does not scale to 100+ engineers; a single deployment unit creates team coordination bottlenecks and deployment conflicts                                  |
| **Modular Monolith**              | Good module separation without distributed system complexity                                                                                 | Still a single deployable unit; does not enable independent scaling or deployment of critical booking path independently of notifications, reporting, etc. |
| **Domain-Oriented Microservices** | Independent deployability per domain, scales with team size, clear ownership boundaries, enables horizontal scaling of high-traffic services | More infrastructure to operate; requires investment in shared concerns (auth, observability, service discovery)                                            |

---

## Decision

**Adopt a domain-oriented microservices architecture.**

Services are decomposed along domain boundaries (not technical layers):

**Scope:**
Given interview constraints, we implement only a simplified Appointment Service comprising:

1. **Simple Appointment Service** — booking lifecycle (create, hold, confirm, cancel) and availability check (could be a separate microservice at larger scale)

**Out of scope:**

1. **Some technical decisions**: To keep the architecture simple, infrastructure and technology choices (including DBMS, caching, and related components) will be standardized around AWS services and Node.js-based frameworks and libraries.
2. **Complex Appointment Service** — complex appointment states (checked in, inprogress, ...), reschedule, flexible booking / slotting algorithms, ...
3. **Availability Service** — slot computation and hold management
4. **Resource Service** — master data (bays, technicians, service types, operating hours)
5. **Customer Service** — customer profiles and vehicle records
6. **Notification Service** — async delivery of booking confirmations and reminders
7. **API versioning & deprecation strategy**

Each service owns its own data store (bounded context). Cross-service communication is:

- **Synchronous (REST/HTTP)** for operations on the critical booking path (e.g., Appointment Service → Availability Service, Customer Service)
- **Asynchronous (SNS/SQS events)** for all non-critical post-booking operations (e.g., notifications, analytics)

---

## Trade-offs

**Positive:**

- Squads can own individual services end-to-end without coordination across team boundaries
- The booking-critical path (Availability + Appointment services) can be scaled independently of notification or reporting workloads
- Each service can be deployed, rolled back, and upgraded independently
- Clear domain ownership reduces cognitive load per squad

**Negative / Accepted Trade-offs:**

- Distributed tracing and observability require centralized tooling (AWS X-Ray / OpenTelemetry) — this must be established early
- Integration testing across services is more complex than a monolith — contract testing (Pact or similar) should be adopted
- Shared infrastructure (API Gateway, Cognito, SNS/SQS) adds operational overhead that must be owned by a platform team

**Migration path for multi-tenancy:** Because `tenant_id` is on every entity from day one, no rearchitecting is needed when onboarding additional dealership groups — access control and data isolation are enforced at the API Gateway boundary.

---

## Out-of-scope Production Requirements

The following are real production requirements deliberately excluded from this demo:

- **CI/CD pipelines** — No deployment pipeline, staging environments, canary releases, or blue/green deployment strategy is defined. In production, each service would need its own pipeline with automated integration tests as a quality gate.
- **Service mesh / sidecar proxies** — Mutual TLS, retries, circuit-breaking, and traffic shaping via a service mesh (e.g., AWS App Mesh, Istio) are not addressed. Synchronous inter-service calls currently have no enforced retry or fallback policy.
- **Secret management** — Database credentials, API keys, and JWT signing secrets are assumed to be available but no rotation strategy, HSM integration, or secrets manager binding (AWS Secrets Manager / Parameter Store) is specified.
- **Infrastructure as Code (IaC)** — No Terraform, CDK, or CloudFormation templates are provided. In production, all AWS resources (ECS clusters, RDS instances, SQS queues, API Gateway) would be codified.
- **Capacity planning and cost modelling** — No resource sizing, RDS instance class selection, or AWS cost estimates are provided. Auto-scaling policies (ECS task targets, RDS read replicas) are not defined.
- **Disaster recovery (DR) and backup strategy** — RTO/RPO targets, cross-region replication, automated RDS snapshots, and failover runbooks are not specified.
- **Compliance and data regulation** — GDPR data-subject rights (right to erasure, data portability), PCI-DSS scope (if payments are ever added), and audit logging retention policies are not addressed.
- **API versioning strategy** — No versioning scheme (URI versioning, `Accept` header, etc.) or deprecation policy is defined for the public API.
- **Developer experience tooling** — Local development setup (Docker Compose service stubs, shared `.env` conventions), inner-loop tooling guidance, and monorepo vs. polyrepo trade-offs are not covered.
- **Load and chaos testing** — No performance baselines, load test plans (k6, Gatling), or chaos engineering practices (e.g., AWS Fault Injection Simulator) are included.
