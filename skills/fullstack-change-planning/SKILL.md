---
name: fullstack-change-planning
description: Fullstack change coordination — cross-stack planning, interface contract verification, integration order. Use when implementation spans both frontend and backend.
---

# Fullstack Change Planning

Specialized context for coordinating changes that span both frontend and backend. Loaded by the DEV agent when the implementation plan identifies cross-stack impact.

## Focus Areas
- Interface contract verification between frontend and backend
- Change sequencing and dependency ordering
- Integration point identification and testing
- API versioning and backward compatibility
- Coordinated rollback planning

## Execution Guidelines
1. Map all integration points between frontend and backend changes.
2. Define the change order: which side changes first, how the other adapts.
3. Verify API contracts are consistent between the solution design, backend implementation, and frontend consumption.
4. Plan integration testing: what tests verify the full stack works together.
5. Identify deployment coupling: can frontend and backend deploy independently, or must they be coordinated.

## Constraints
- Do NOT implement changes directly — this skill provides planning context only.
- Flag any API contract ambiguities between frontend and backend before implementation begins.
- Document the integration test plan in the implementation plan.
