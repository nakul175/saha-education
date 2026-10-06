# Saha Education Testing

This document describes the testing approach and layers for the Saha Education system.

## Overview

Saha Education follows a comprehensive testing strategy with multiple layers to ensure quality and reliability of the application. The testing approach includes unit tests, integration tests, API tests, and UI component tests.

## Test Layers

### 1. Unit Tests
Located in `tests/unit/` directory.

Unit tests focus on individual functions and modules in the application layer (`lib/education/`). They test business logic in isolation without external dependencies.

Test scope includes:
- Data validation functions
- Business rules implementation  
- Utility functions
- Core domain logic

### 2. Integration Tests  
Located in `tests/integration/` directory.

Integration tests verify that different parts of the application work together correctly. These tests typically cover:

- API endpoint behavior and responses
- Database operations and data integrity
- Complex business flows  
- Data transformation between layers

### 3. API Tests
Located in `tests/integration/api/` directory.

API tests specifically target the Next.js API routes that handle data operations. They test:
- REST endpoints for CRUD operations
- Request/response processing
- Error handling 
- Authentication and authorization

### 4. UI Component Tests
Located in `tests/ui/` directory.

UI component tests verify that React components render correctly and behave as expected:
- Component rendering and structure  
- User interactions and event handling
- Props validation
- Accessibility compliance

## Test Commands

All tests can be run using the following commands:

```bash
# Run all tests
pnpm test

# Run static analysis
pnpm test:static

# Run unit tests  
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run resilience tests
pnpm test:resilience

# Run smoke tests
pnpm test:smoke

# Run UI tests
pnpm test:ui

# Run non-functional requirement tests
pnpm test:nfr

# Run user acceptance tests
pnpm test:uat

# Run regression tests  
pnpm test:regression

# Run full test suite
pnpm test:full

# Check test catalogue
pnpm test:catalogue
```

## Test Structure

### Unit Tests
- Located in `tests/unit/` directory
- Each module has corresponding test files using TypeScript and Jest/Testing Library
- Mock external dependencies for isolated testing
- Focus on business logic correctness

### Integration Tests  
- Located in `tests/integration/` directory
- Test full application flows from API endpoints to database operations
- Include database transactions and rollback mechanisms where appropriate
- Use test databases for isolated testing

### API Tests
- Located in `tests/integration/api/` directory
- Verify that all API routes work correctly
- Test various HTTP methods (GET, POST, PUT, DELETE)
- Validate request/response payloads and error responses

### UI Tests
- Located in `tests/ui/` directory  
- Test component behavior with Playwright or similar tools
- Include visual regression tests where applicable
- Verify accessibility compliance and user interaction flow

## Testing Principles

1. **Isolation**: Unit tests should be completely isolated from external dependencies.
2. **Coverage**: Aim for high test coverage, but prioritize critical business logic.
3. **Automation**: All tests should run automatically in CI/CD pipeline.
4. **Speed**: Tests should execute quickly for rapid feedback during development. 
5. **Maintainability**: Test code should be as maintainable as production code.
6. **Realism**: Tests should closely mirror real-world usage patterns.

## Continuous Integration

All tests are integrated into the CI/CD pipeline:
- Unit tests run on every commit  
- Integration tests run on feature branches
- Full test suite runs before merging to main
- Test results are reported and validated during deployment

## Test Data Management

- Test data is managed in dedicated test databases or in-memory databases
- Database state is reset between tests for isolation
- Mock data generators create realistic test scenarios  
- Real-world constraints are mimicked through test fixtures