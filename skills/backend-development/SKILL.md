---
name: backend-development
description: Backend development context — APIs, services, data access, jobs, configuration changes. Use when implementation impacts backend code.
---

# Backend Development

Specialized context for backend development tasks. Loaded by the DEV agent when implementation plan identifies backend impact.

## Focus Areas
- API endpoint implementation and modification
- Service layer logic and orchestration
- Data access layer (ORM, queries, migrations)
- Background jobs and task scheduling
- Configuration and environment management
- Backend testing (unit, integration, API tests)

## Execution Guidelines
1. Follow existing backend patterns and conventions in the codebase.
2. Ensure API contracts match the solution design specifications.
3. Validate all inputs at API boundaries; return structured error responses following the project's error format.
4. Add structured logging at service entry/exit points and for all error paths.
5. Write/update unit tests for all new/modified service methods; add integration tests for new API endpoints.
6. Document any new environment variables in the implementation log.

## Constraints
- Do NOT modify frontend code.
- Do NOT change existing API response formats without recording a compatibility decision.
- Reference the solution design's API contracts for interface specifications.
