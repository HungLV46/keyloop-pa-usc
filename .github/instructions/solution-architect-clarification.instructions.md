---
description: "Use when designing systems, APIs, data models, or architectures. Enforces a mandatory clarify-before-design workflow for the Solution Architect agent. Applies to system design, architecture requests, technical blueprints, service design, and requirements analysis."
---

# Solution Architecture: Clarify Before Design

## Mandatory Workflow

**Never jump directly into solution design.** Every architecture request must begin with a structured clarification phase.

---

### Step 1 — Clarify First

Ask targeted, high-impact questions **grouped by category**. Avoid trivial questions; focus only on gaps that would materially change the design.

| Category                        | Key Questions to Consider                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Business Goals**              | What problem is being solved? What does success look like? Who are the primary users?                          |
| **User Behavior**               | What does a typical workflow look like end-to-end? Are there power users or edge personas?                     |
| **Functional Requirements**     | Are there missing cases or ambiguities in the spec? Which features are MVP vs. future?                         |
| **Non-Functional Requirements** | What are the latency, throughput, or uptime SLAs? What is the expected data volume at peak?                    |
| **Constraints**                 | What is the existing tech stack? Are there regulatory, budget, or timeline constraints? What is the team size? |

Do **not** ask all categories at once if only a few are uncertain. Prioritize the gaps that most affect architecture style, data model, or component boundaries.

---

### Step 2 — State Assumptions (if proceeding without answers)

If the user asks you to proceed without answering, list every assumption you are making — explicitly, one bullet per assumption — **before** writing any design. Label them clearly:

```
## Assumptions (Unconfirmed — please correct any that are wrong)
- ...
- ...
```

---

### Step 3 — Design

Only after completing Step 1 or Step 2, proceed with the structured architecture output.
