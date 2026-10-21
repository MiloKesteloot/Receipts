# Implementation Plan: User Story 1.4 - Join Group via Invite Code

**Branch**: `feature/us-1.4-join-group` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/us-1.4-join-group/spec.md`: "Join group with invite code, case-insensitive, correct code adds & opens group, wrong code shows error, joining twice opens group, and toast popups for all 3 scenarios."

---

## Summary

Implement the "Join Group via Invite Code" feature as an isolated, modular component and service layer for the React Native / Expo application, backed by a Supabase PostgreSQL database. The client provides a clean, accessible `JoinGroupModal` modal dialog and an in-app animated `Toast` component. The backend is implemented via a PostgreSQL stored procedure (`join_group`) exposed via Supabase RPC (which translates directly to an HTTP POST endpoint). The service handles case insensitivity, whitespace trimming, idempotent repeat joins, and surfaces distinct toasts and error states across all acceptance criteria.

---

## Technical Context

**Language/Version**: TypeScript 5.7+ / Node.js 20+  
**Primary Dependencies**: React 19.2.3, React Native 0.86.3, Expo SDK 57, `@supabase/supabase-js` 2.117.3, `react-native-reanimated` 4.5.1 (or standard `Animated`), `expo-router` 57  
**Storage**: Supabase PostgreSQL tables (`groups`, `group_members`) with stored function `public.join_group(p_invite_code text, p_user_id text)`  
**Testing**: Automated unit and integration tests (Jest / Node test runner) covering the 3 acceptance scenarios: correct code, wrong code, and joining twice  
**Target Platform**: iOS, Android, and Web (Expo Go & Development builds)  
**Project Type**: Mobile Application (Expo / React Native) with Supabase BaaS  
**Performance Goals**: Network join request < 500ms; toast render < 16ms (60fps); zero perceptible UI lag on modal transitions  
**Constraints**: Zero merge conflicts with parallel branches (Authentication and Groups Page); must operate gracefully with a pluggable user context while auth is pending; offline and network errors handled without crashing  
**Scale/Scope**: Lightweight modal component, toast provider/component, Supabase migration script, and client service  

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | Requirement | Evaluation & Status |
| :--- | :--- | :--- |
| **I. Modularity & Zero-Conflict Seams** | Feature must be self-contained in new files without altering teammates' work in progress | **PASS**: All new code lives in dedicated files (`src/components/join-group-modal.tsx`, `src/components/toast.tsx`, `src/lib/groups.ts`, `supabase/migrations/`). |
| **II. Mobile-First & Cross-Platform** | Must adhere to Expo and React Native best practices on iOS and Android | **PASS**: Uses standard React Native components, handles keyboard dismissal, safe areas, and provides cross-platform toasts. |
| **III. Test-Driven Verification** | Explicit automated tests for all acceptance scenarios | **PASS**: Automated tests written to verify valid codes, invalid codes, case variations, and repeat join idempotency. |
| **IV. Defensive Error & Network Handling** | Graceful handling of network timeouts, duplicate submissions, and unexpected responses | **PASS**: In-flight submission locking, trim sanitization, error toasts, and fallback handling. |

*Gate Evaluation Outcome: ALL PASS. No constitutional violations.*

---

## Project Structure

### Documentation (this feature)

```text
specs/us-1.4-join-group/
├── spec.md                  # Feature specification (technology-agnostic)
├── plan.md                  # Implementation plan (this file)
└── checklists/
    └── requirements.md      # Specification quality review checklist
```

### Source Code (repository layout)

```text
src/
├── components/
│   ├── join-group-modal.tsx     # Interactive join dialog with input, submit, and error banner
│   ├── toast.tsx                # Lightweight, cross-platform animated toast notification component
│   └── placeholder-screen.tsx   # (Existing) Stand-in placeholder screen
├── lib/
│   ├── groups.ts                # Group joining service, error normalization, and case sanitization
│   └── supabase.ts              # (Existing) Supabase client configuration
└── app/
    └── _layout.tsx              # Root navigator (temporary test mount / hook)

supabase/
└── migrations/
    └── 20261014_groups_schema.sql # Schema for groups, group_members, and join_group RPC function

tests/
└── unit/
    └── groups.test.ts           # Unit tests for group join service and acceptance scenarios
```

**Structure Decision**: Modular component and library pattern. The UI (`JoinGroupModal`), notification (`Toast`), and backend service (`groups.ts`) are completely decoupled so they can be tested independently or mounted anywhere (e.g. inside the Groups screen once complete).

---

## Architectural Design & Contracts

### 1. Database Schema & RPC Contract (`POST /groups/join`)

In Supabase, calling `supabase.rpc('join_group', { p_invite_code, p_user_id })` executes an HTTP POST to `/rest/v1/rpc/join_group`.

#### Database Tables (`supabase/migrations/20261014_groups_schema.sql`):
```sql
-- Groups table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group members table with composite uniqueness
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_user UNIQUE (group_id, user_id)
);
```

#### Stored Function (`join_group`):
* Performs case-insensitive lookup: `WHERE LOWER(invite_code) = LOWER(p_invite_code)`.
* Checks existing membership:
  - If member exists: Returns status `'ALREADY_MEMBER'` with group details.
  - If new member: Inserts into `group_members` and returns status `'JOINED'` with group details.
  - If group not found: Returns status `'NOT_FOUND'`.

#### Service Response Contract (`src/lib/groups.ts`):
```typescript
export type JoinGroupResult =
  | { success: true; status: "JOINED"; group: { id: string; name: string; invite_code: string } }
  | { success: true; status: "ALREADY_MEMBER"; group: { id: string; name: string; invite_code: string } }
  | { success: false; error: "NOT_FOUND" | "NETWORK_ERROR" | "VALIDATION_ERROR"; message: string };
```

---

### 2. UI Components Design

* **`Toast` (`src/components/toast.tsx`)**:
  - Props: `visible: boolean`, `message: string`, `type: 'success' | 'info' | 'error'`, `onDismiss: () => void`.
  - Self-dismisses after 3 seconds; slides up from the **bottom** of the screen (`insets.bottom + 16`).
  - Palette tokens:
    - Success: Background `#ddeae0` with dark forest green text (`#1B4332`) and border `#B7D2BD`.
    - Error: Background `#eacecd` with dark burgundy text (`#5C1D24`) and border `#D8ACAB`.
    - Info: Background `#dce5f5` with dark blue text (`#1E3A8A`) and border `#BAC8E8`.
* **`JoinGroupModal` (`src/components/join-group-modal.tsx`)**:
  - Props: `visible: boolean`, `onClose: () => void`, `onSuccess: (group: Group) => void`, `userId?: string`.
  - Input field with automatic trimming and uppercase auto-capitalization helper.
  - Primary button styled with `expo-linear-gradient` using the project design gradient (`['#B4C5E7', '#97B685']`).
  - Disables submit button while submission is in-flight (`loading` spinner).
  - Triggers corresponding bottom Toast on error, already in group, or joined successfully.

---

## Testing Strategy

Automated test suite in `tests/unit/groups.test.ts` will validate:
1. **Scenario 1 (Valid Code / New Member)**:
   - Call `joinGroupByCode("APT402", "user-1")` -> returns `status: "JOINED"`, toast shows `"Joined {group.name} successfully"`.
   - Call with lowercase `joinGroupByCode("apt402", "user-1")` -> succeeds identically.
2. **Scenario 2 (Invalid Code)**:
   - Call `joinGroupByCode("WRONG123", "user-1")` -> returns `success: false`, error message displayed, error toast shown.
3. **Scenario 3 (Joining Twice)**:
   - Call `joinGroupByCode("APT402", "user-1")` a second time -> returns `status: "ALREADY_MEMBER"`, toast shows `"You are already in this group"`.

---

## Complexity Tracking

> No constitutional violations or unwarranted complexity. Architecture follows pure modular decomposition.
