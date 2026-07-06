---
name: frontend-development
description: Frontend development context — pages, components, interactions, state management, API adaptation. Use when implementation impacts frontend code.
---

# Frontend Development

Specialized context for frontend development tasks. Loaded by the DEV agent when implementation plan identifies frontend impact.

## Focus Areas
- Page and component implementation/modification
- User interaction flows and event handling
- Client-side state management
- API request/response adaptation and error handling
- UI styling following project conventions
- Frontend testing (component tests, interaction tests)

## Execution Guidelines
1. Follow existing frontend patterns (component structure, styling approach, state management) in the codebase.
2. Ensure API calls match the solution design's interface contracts — verify request/response shapes.
3. Handle loading, empty, and error states for every data-fetching component.
4. Write component tests for new/modified components; add interaction tests for user flows.
5. Document any new UI dependencies or component library additions.

## Constraints
- Do NOT modify backend code.
- Do NOT change API contracts — flag mismatches with the solution design for review.
- Maintain existing UI patterns unless the design explicitly specifies changes.
