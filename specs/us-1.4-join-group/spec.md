# Feature Specification: User Story 1.4 - Join Group via Invite Code

**Feature Branch**: `feature/us-1.4-join-group`  
**Created**: 2026-10-14  
**Status**: Draft  
**Input**: User description: "As a user, I want to type in my roommate's invite code, so that I can join their group. Done when: a correct code adds me and opens the group, a wrong code shows an error, and joining twice just opens the group. App: Join window on the Groups page with a code input and error messages. Server: POST /groups/join with any letter case accepted. Test: Correct code, wrong code, joining twice. Toast popups for all 3 scenarios: error message, 'You are already in this group', or 'Joined {group name} successfully'."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Join New Group with Valid Invite Code (Priority: P1)

When a user receives an invite code from a roommate or group admin, they can open the join window, type the code, and submit it to become a member of the group. Upon joining, they receive clear visual confirmation and are brought directly into the group.

**Why this priority**: Primary happy path and core value of this feature—enabling collaboration on shared expenses.

**Independent Test**: Can be tested independently by launching the join window, entering a valid invite code, and verifying that the user is added to the group membership in persistent storage, a success toast displays the group name, and the group view is opened.

**Acceptance Scenarios**:

1. **Given** a group exists with code `"APT402"` and the current user is not a member,  
   **When** the user enters `"APT402"` and submits,  
   **Then** the user is added as a member of the group, a success toast displays `"Joined {group name} successfully"`, the join window closes, and the group view is opened.
2. **Given** a group exists with code `"APT402"`,  
   **When** the user enters lowercase `"apt402"` or mixed-case `"Apt402"`,  
   **Then** the server accepts the code regardless of letter case, successfully adds the user, displays the success toast, and opens the group view.

---

### User Story 2 - Handle Invalid or Non-existent Invite Code (Priority: P1)

When a user mistypes or enters an invalid invite code, the system prevents the join attempt, informs the user of the error via both an on-screen message and a temporary toast notification, and allows them to correct the input without losing what they typed.

**Why this priority**: Essential error handling to prevent dead ends and guide users when they make a typo or receive an incorrect code.

**Independent Test**: Can be tested independently by entering an invalid code (e.g., `"INVALID99"`), submitting, and asserting that no group membership is created, an error toast appears, an inline error message appears below the input, and the input remains available for editing.

**Acceptance Scenarios**:

1. **Given** no group exists with code `"XYZ999"`,  
   **When** the user enters `"XYZ999"` and submits,  
   **Then** the server rejects the join request, an error toast displays the failure reason (e.g. `"Invalid invite code"`), an inline error message appears in the join window, and the window remains open with the entered text preserved.
2. **Given** an error message is visible in the join window,  
   **When** the user edits the input text,  
   **Then** the inline error state is cleared or updated to prepare for a new submission attempt.

---

### User Story 3 - Existing Member Joining Twice (Priority: P2)

When an existing member enters an invite code for a group they have already joined, the system recognizes their existing membership, smoothly opens the group view, and displays an informational message without creating duplicate membership records or throwing a failure error.

**Why this priority**: Guarantees idempotency and smooth user experience when a roommate re-sends an invite code or a user forgets they previously joined.

**Independent Test**: Can be tested independently by submitting an invite code for a group the user already belongs to; the system must not add duplicate membership records, displays an informational toast notification, closes the join window, and opens the group view.

**Acceptance Scenarios**:

1. **Given** the user is already an active member of group `"APT402"`,  
   **When** the user enters `"APT402"` and submits,  
   **Then** no duplicate membership record is created, an informational toast displays `"You are already in this group"`, the join window closes, and the group view is opened.

---

### Edge Cases

- **Leading/Trailing Whitespace**: If the user pastes or types a code with accidental spaces (e.g., `"  APT402  "`), the system must automatically trim surrounding whitespace before submission.
- **Empty or Whitespace-Only Code**: Submitting an empty field must prompt the user with a validation message (e.g., `"Please enter an invite code"`) without initiating a server request.
- **In-Flight Network Request**: While a join request is in progress, the submit action must be disabled and provide visual loading feedback to prevent duplicate submissions from rapid tapping.
- **Server Unavailability**: If the server is unreachable or encounters an internal failure, the system must display a non-crashing error toast (e.g., `"Unable to connect to server. Please try again."`) and keep the join window intact.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an interactive join window accessible from the groups interface or an independent entry point.
- **FR-002**: The join window MUST contain an invite code input field and an explicit submit control.
- **FR-003**: System MUST accept invite codes in **any letter case** (case-insensitive matching against stored group codes).
- **FR-004**: System MUST automatically strip leading and trailing whitespace from the entered code before processing.
- **FR-005**: The server MUST verify whether the requested group exists and check whether the requesting user is already a member.
- **FR-006**: When the invite code is valid and the user is not yet a member, the server MUST add the user to the group membership and return the group details.
- **FR-007**: When the invite code is valid and the user is already a member, the server MUST return the group details without creating duplicate memberships or reporting an error.
- **FR-008**: When the invite code does not match any existing group, the server MUST return an invalid code error response.
- **FR-009**: The system MUST provide feedback via toast notifications across all three outcome scenarios:
  - Failure/Error: Error toast displaying the failure reason + inline error message, styled in soft pastel blush red (`#eacecd`) with dark high-contrast text.
  - Existing Member: Informational toast stating `"You are already in this group"`, styled in soft pastel periwinkle blue (`#dce5f5`) with dark high-contrast text.
  - New Member: Success toast stating `"Joined {group name} successfully"`, styled in soft pastel sage green (`#ddeae0`) with dark high-contrast text.
- **FR-010**: Upon successful join or repeat join, the system MUST close the join window and open the group view.
- **FR-011**: While user authentication is pending in the application, the system MUST support an isolated user identity context so that group membership operations can be fully validated independently.
- **FR-012**: Toast notifications MUST be anchored at the bottom of the device screen, respecting device safe area margins above navigation bars.
- **FR-013**: The primary join action button MUST incorporate the project design palette, utilizing a vertical gradient transitioning from soft periwinkle blue (`#B4C5E7`) at the top to soft sage green (`#97B685`) at the bottom.

### Key Entities

- **Group**: Represents a shared collection of users collaborating on receipts. Attributes include a unique identifier, a human-readable display name, a unique invite code, and creation metadata.
- **Group Membership**: Represents the association between a user and a group. Attributes include the group reference, user reference, and join timestamp. Enforces uniqueness so a user cannot be added to the same group more than once.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users submitting a valid invite code reach the joined group view in under 2 seconds under standard network conditions.
- **SC-002**: 100% of letter-case variations (e.g. uppercase, lowercase, mixed case) for an existing code resolve to the target group.
- **SC-003**: 100% of invalid code submissions present both an on-screen error message and a toast notification without crashing or closing the join window.
- **SC-004**: Submitting a code for a group the user already belongs to produces zero duplicate records and 100% consistent navigation to the group.
- **SC-005**: Automated tests verify all three primary test scenarios (valid code, invalid code, repeated join).

---

## Assumptions

- **Pre-existing Groups**: For test validation, at least one target group with an invite code exists in persistent storage.
- **Notification Visibility**: Toast notifications will be rendered as self-dismissing in-app overlay banners that are clearly readable across all device screen sizes.
- **Navigation Transition**: Opening a group transitions the view to the group's detail view, or invokes the group selection callback if the full groups view is under development by teammates.
- **Isolation from Other Features**: The join feature is designed as a modular component so it can be integrated into the main application layout without dependencies on in-progress authentication or group listing screens.
