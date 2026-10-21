<!--
Sync Impact Report:
- Version change: Template Initial → 1.0.0
- List of modified principles:
  - [PRINCIPLE_1_NAME] → I. Rigorous Code Quality & Static Analysis
  - [PRINCIPLE_2_NAME] → II. Test-First & Automated Verification (Non-Negotiable)
  - [PRINCIPLE_3_NAME] → III. Modularity, Low Coupling & High Cohesion
  - [PRINCIPLE_4_NAME] → IV. Self-Documenting Architecture & Explicit Design
  - [PRINCIPLE_5_NAME] → V. Proactive Refactoring & Debt Elimination
- Added sections:
  - [SECTION_2_NAME] → Quality Gates & Verification Standards
  - [SECTION_3_NAME] → Development Workflow & Review Process
- Removed sections: None
- Follow-up TODOs: None
-->

# Spec-Kit Constitution

## Core Principles

### I. Rigorous Code Quality & Static Analysis
All code written in this repository MUST adhere to consistent formatting, strict static typing, and automated linting standards.
- Static analysis and linter checks MUST pass with zero errors and zero warnings.
- Code MUST avoid arbitrary complexity: functions MUST be concise, focused on a single responsibility, and bounded in cyclomatic complexity.
- Rationale: High baseline standards reduce defect rates, eliminate stylistic disputes during code review, and ensure readability across contributors.

### II. Test-First & Automated Verification (Non-Negotiable)
Automated testing is non-negotiable for all business logic, data models, and critical workflows.
- All new features, enhancements, and bug fixes MUST be accompanied by comprehensive unit and integration tests.
- Test-Driven Development (TDD) principles MUST be prioritized: tests written and failing before implementation is deemed complete.
- Edge cases, error handling, and boundary conditions MUST be covered.
- Regression tests MUST be authored for every fixed defect to prevent reintroduction.
- Flaky tests MUST be treated as build failures and resolved immediately.
- Rationale: Comprehensive test suites give teams confidence to ship continuously and refactor aggressively without fear of unseen regressions.

### III. Modularity, Low Coupling & High Cohesion
Components and packages MUST be structured as modular, cohesive units with clean separation of concerns.
- Modules MUST expose minimal public surfaces; internal implementation details MUST remain encapsulated and private.
- Dependencies between modules MUST be explicit and decoupled, favoring composition and dependency injection over rigid inheritance or shared global state.
- Code MUST adhere to DRY (Don't Repeat Yourself) while avoiding premature or overly complex abstractions (YAGNI).
- Rationale: Decoupled systems reduce side effects, confine the blast radius of changes, and enable isolated testing and parallel development.

### IV. Self-Documenting Architecture & Explicit Design
The architecture and implementation of the codebase MUST be intuitive, self-explanatory, and intentional.
- Variable, function, and component names MUST be descriptive and communicate intent without relying on redundant comments.
- APIs and domain models MUST be designed so that invalid states are unrepresentable by typing.
- Non-obvious architectural decisions, performance tradeoffs, and integration patterns MUST be documented in explicit specifications or ADRs.
- Rationale: Code is read far more often than it is written; intentional naming and clear structure minimize cognitive load for maintainers.

### V. Proactive Refactoring & Debt Elimination
Code health MUST be continuously maintained and improved rather than left to accumulate as technical debt.
- Contributors MUST follow the Boy Scout Rule: leave modified code cleaner than it was found.
- Dead code, unused dependencies, and obsolete features MUST be removed immediately rather than commented out or left dormant.
- Technical compromises or temporary workarounds MUST be tracked with actionable issue references and time-bounded resolution plans.
- Rationale: Uncontrolled technical debt compounds exponentially over time, degrading developer velocity, codebase reliability, and overall product quality.

## Quality Gates & Verification Standards

To uphold the core principles, the following automated and manual quality gates MUST be enforced:
- **Continuous Integration**: Every pull request MUST pass automated test suites, linting, formatting checks, and type verification before merge.
- **Test Integrity**: Test coverage MUST be maintained or improved with every substantive pull request. Mocks MUST be used sparingly and only at external system boundaries.
- **Dependency Management**: External dependencies MUST be vetted for security vulnerabilities, maintenance status, license compatibility, and minimal footprint before adoption.

## Development Workflow & Review Process

All contributions MUST flow through a structured verification lifecycle:
- **Specification & Planning**: Non-trivial changes MUST define requirements and testing strategies before code generation or implementation begins.
- **Atomic Commits & Focused Pull Requests**: Changes SHOULD be packaged into logical, readable pull requests addressing a single objective.
- **Mandatory Peer Review**: Pull requests MUST be reviewed by at least one peer who verifies architectural soundness, test completeness, and constitutional compliance.
- **Zero Broken Windows**: CI failures, broken tests, or lint violations in trunk/main MUST be prioritized and resolved before new feature work proceeds.

## Governance

This constitution represents the supreme architectural and quality charter of the project. It supersedes informal agreements and transient implementation preferences.

- **Authority & Compliance**: All proposed changes, PRs, and architectural reviews MUST verify explicit compliance with these principles.
- **Amendment Procedure**: Amendments to this constitution require a formal proposal, review period, team consensus, and an impact evaluation across existing code and workflows.
- **Versioning Policy**:
  - **MAJOR** version bumps (e.g., 1.0.0 → 2.0.0) indicate backward-incompatible governance shifts, removal of principles, or fundamental changes to quality thresholds.
  - **MINOR** version bumps (e.g., 1.0.0 → 1.1.0) indicate the addition of new principles, quality gates, or materially expanded sections.
  - **PATCH** version bumps (e.g., 1.0.0 → 1.0.1) indicate wording clarifications, typo fixes, or non-semantic formatting updates.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
