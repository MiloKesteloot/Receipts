# Tasks: User Story 1.4 - Join Group via Invite Code

**Input**: Design documents from `specs/us-1.4-join-group/` (`spec.md`, `plan.md`)  
**Prerequisites**: `plan.md` (architecture & contracts), `spec.md` (user stories & acceptance criteria)  
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`[US1]`, `[US2]`, `[US3]`)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, types, and directories layout

- [X] T001 Create project directories `src/components/`, `src/lib/`, `tests/unit/`, and `supabase/migrations/` per implementation plan
- [X] T002 [P] Initialize TypeScript interfaces for `Group`, `GroupMembership`, and `JoinGroupResult` in `src/lib/groups.types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: Foundational components required by all 3 user stories (toast system, mock service seam, and database schema)

- [X] T003 [P] Implement lightweight cross-platform animated `Toast` component and provider in `src/components/toast.tsx`
- [X] T004 [P] Define database schema (`groups`, `group_members`) and `join_group` stored procedure in `supabase/migrations/20261014_groups_schema.sql`
- [X] T005 Implement `GroupService` interface and in-memory mock service with seed data in `src/lib/groups.ts`

**Checkpoint**: Foundational contracts and mock seam ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Join New Group with Valid Invite Code (Priority: P1) 🎯 MVP

**Goal**: As a user with an invite code from a roommate, type the code into a join window, submit it, see a success toast `"Joined {group name} successfully"`, and open the group. Accepts any letter case.

**Independent Test**: Enter `"APT402"` or `"apt402"` into the modal; verify user is added as member, success toast displays `"Joined Apartment 402 successfully"`, modal closes, and group navigation callback is invoked.

### Tests for User Story 1

- [X] T006 [P] [US1] Unit test for successful join with valid code and case-insensitivity (`"APT402"`, `"apt402"`) in `tests/unit/groups.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Implement case-insensitive lookup (`trim().toLowerCase()`) and member insertion in `src/lib/groups.ts`
- [X] T008 [US1] Build `JoinGroupModal` with invite code input, submit button, loading spinner, and success toast trigger in `src/components/join-group-modal.tsx`
- [X] T009 [US1] Mount temporary "Join Group" trigger button on `src/app/index.tsx` for interactive on-device verification

**Checkpoint**: User Story 1 is fully functional and testable independently (MVP ready!)

---

## Phase 4: User Story 2 - Handle Invalid or Non-existent Invite Code (Priority: P1)

**Goal**: When a user enters an incorrect or non-existent code, prevent join, display an inline error message and an error toast, and keep the input intact for correction.

**Independent Test**: Enter `"INVALID999"`; verify request fails, error toast appears, inline error text displays in modal, and entered code is not wiped.

### Tests for User Story 2

- [X] T010 [P] [US2] Unit test for invalid invite code returning `NOT_FOUND` error and empty code validation in `tests/unit/groups.test.ts`

### Implementation for User Story 2

- [X] T011 [US2] Implement invalid code error handling, empty string validation, and user-friendly error messages in `src/lib/groups.ts`
- [X] T012 [US2] Update `JoinGroupModal` in `src/components/join-group-modal.tsx` to render inline error banner and trigger error toast while preserving user input

**Checkpoint**: User Stories 1 and 2 both work and handle valid/invalid flows independently

---

## Phase 5: User Story 3 - Existing Member Joining Twice (Priority: P2)

**Goal**: When an existing group member enters the invite code for their group again, recognize existing membership, show `"You are already in this group"` toast, and open the group without creating duplicate records.

**Independent Test**: Submit invite code for a group the user is already part of; verify no duplicate record is created, toast displays `"You are already in this group"`, and group view opens.

### Tests for User Story 3

- [X] T013 [P] [US3] Unit test verifying repeat join returns `ALREADY_MEMBER` status without duplicate entries in `tests/unit/groups.test.ts`

### Implementation for User Story 3

- [X] T014 [US3] Implement idempotency check (`ALREADY_MEMBER`) in `src/lib/groups.ts`
- [X] T015 [US3] Update `JoinGroupModal` in `src/components/join-group-modal.tsx` to display `"You are already in this group"` toast and navigate to group view

**Checkpoint**: All 3 user stories are complete, idempotent, and independently verified

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Supabase production wiring, linting, typechecking, and final verification

- [X] T016 [P] Add Supabase RPC client integration in `src/lib/groups.ts` with transparent fallback to mock service when `.env` is unconfigured
- [X] T017 Run complete automated test suite verifying all 3 acceptance criteria in `tests/unit/groups.test.ts`
- [X] T018 Run `npx expo lint` and `npx tsc --noEmit` to verify type safety and adherence to repository code standards

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Stories (Phases 3, 4, 5)**: Depend on Phase 2 completion
  - US1 (P1) is the core MVP
  - US2 (P1) adds defensive error handling to US1 modal
  - US3 (P2) adds repeat join handling to US1/US2 flow
- **Polish (Phase 6)**: Runs after user story implementation

### Parallel Opportunities

- **T002 [P]** (Types) can be created in parallel with **T001** (Directories)
- **T003 [P]** (`Toast` component) and **T004 [P]** (`SQL migration`) can be implemented in parallel
- **T006 [P]**, **T010 [P]**, and **T013 [P]** (Unit tests) can be written in parallel
- **T016 [P]** (Supabase RPC integration) can be prepared in parallel with UI tasks

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational: Toast & Mock Service)
2. Complete Phase 3 (User Story 1: Join new group, case insensitivity, success toast)
3. **STOP and VALIDATE**: Verify on device/simulator with Expo that entering `"APT402"` or `"apt402"` joins and shows success toast

### Incremental Delivery

1. Setup + Foundation ready
2. Add US1 $\rightarrow$ Test valid join $\rightarrow$ MVP verified
3. Add US2 $\rightarrow$ Test invalid code $\rightarrow$ Error toast & inline error verified
4. Add US3 $\rightarrow$ Test joining twice $\rightarrow$ Idempotent toast verified
5. Final polish $\rightarrow$ Run lint, typecheck, and automated test suite
