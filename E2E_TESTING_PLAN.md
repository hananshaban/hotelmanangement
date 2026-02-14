# E2E Testing Plan for Check-ins Feature

## Overview
This document outlines the end-to-end testing strategy for the complete check-ins workflow using Playwright or Cypress.

## Testing Infrastructure Setup

### Option 1: Playwright (Recommended)

#### Installation
```bash
npm install --save-dev @playwright/test
npx playwright install
```

#### Configuration
Create `playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Option 2: Cypress

#### Installation
```bash
npm install --save-dev cypress
npx cypress open
```

#### Configuration
Create `cypress.config.js`:
```javascript
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  },
});
```

## E2E Test Scenarios

### 1. Complete Check-in Workflow
**File:** `e2e/check-in-workflow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Check-in Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should complete full check-in flow', async ({ page }) => {
    // 1. Navigate to reservations
    await page.click('a[href="/reservations"]');
    await expect(page).toHaveURL('/reservations');

    // 2. Find a confirmed reservation
    const checkInButton = page.locator('button:has-text("Check In")').first();
    await expect(checkInButton).toBeVisible();

    // 3. Click check-in button
    await checkInButton.click();

    // 4. Verify modal opened
    await expect(page.locator('text=Check In Guest')).toBeVisible();

    // 5. Select a room
    await page.selectOption('select', { index: 1 });

    // 6. Add notes
    await page.fill('textarea[placeholder*="notes"]', 'Guest requested early check-in');

    // 7. Confirm check-in
    await page.click('button:has-text("Confirm Check-in")');

    // 8. Verify success message
    await expect(page.locator('text=Guest checked in successfully')).toBeVisible();

    // 9. Navigate to check-ins page
    await page.click('a[href="/check-ins"]');
    await expect(page).toHaveURL('/check-ins');

    // 10. Verify check-in appears in list
    await expect(page.locator('.bg-white').first()).toBeVisible();
  });

  test('should prevent check-in with invalid data', async ({ page }) => {
    await page.goto('/reservations');
    
    const checkInButton = page.locator('button:has-text("Check In")').first();
    await checkInButton.click();

    // Try to submit without selecting a room
    await page.click('button:has-text("Confirm Check-in")');

    // Verify error or button disabled
    await expect(page.locator('button:has-text("Confirm Check-in")')).toBeDisabled();
  });
});
```

### 2. Checkout Workflow
**File:** `e2e/checkout-workflow.spec.ts`

```typescript
test.describe('Checkout Workflow', () => {
  test('should complete checkout flow', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to check-ins
    await page.click('a[href="/check-ins"]');

    // Find active check-in
    const checkoutButton = page.locator('button:has-text("Checkout")').first();
    await checkoutButton.click();

    // Verify modal
    await expect(page.locator('text=Checkout Guest')).toBeVisible();

    // Add notes
    await page.fill('textarea', 'Guest checked out on time');

    // Confirm checkout
    await page.click('button:has-text("Confirm Checkout")');

    // Verify success
    await expect(page.locator('text=Guest checked out successfully')).toBeVisible();
  });
});
```

### 3. Room Change Workflow
**File:** `e2e/room-change-workflow.spec.ts`

```typescript
test.describe('Room Change Workflow', () => {
  test('should change room for active check-in', async ({ page }) => {
    // Login and navigate
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.click('a[href="/check-ins"]');

    // Find active check-in and click change room
    const changeRoomButton = page.locator('button:has-text("Change Room")').first();
    await changeRoomButton.click();

    // Verify modal
    await expect(page.locator('text=Change Room')).toBeVisible();

    // Select new room
    await page.selectOption('select[required]', { index: 1 });

    // Select reason
    await page.selectOption('select:has-text("Reason")', 'upgrade');

    // Add notes
    await page.fill('textarea', 'Guest requested room upgrade');

    // Confirm change
    await page.click('button:has-text("Confirm Room Change")');

    // Verify success
    await expect(page.locator('text=Room changed successfully')).toBeVisible();
  });
});
```

### 4. Check-in Details View
**File:** `e2e/check-in-details.spec.ts`

```typescript
test.describe('Check-in Details', () => {
  test('should display check-in details', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to check-ins
    await page.click('a[href="/check-ins"]');

    // Click view button
    const viewButton = page.locator('button:has-text("View")').first();
    await viewButton.click();

    // Verify modal with details
    await expect(page.locator('text=Check-in Details')).toBeVisible();
    await expect(page.locator('text=Guest Information')).toBeVisible();
    await expect(page.locator('text=Room Information')).toBeVisible();
    await expect(page.locator('text=Check-in Details')).toBeVisible();
  });
});
```

### 5. Dashboard Integration
**File:** `e2e/dashboard-check-ins.spec.ts`

```typescript
test.describe('Dashboard Check-ins Stats', () => {
  test('should display check-ins stats on dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Verify on dashboard
    await expect(page).toHaveURL('/dashboard');

    // Check for check-ins stats
    await expect(page.locator('text=Active Check-ins')).toBeVisible();
    await expect(page.locator('text=Today\'s Check-ins')).toBeVisible();
    await expect(page.locator('text=Today\'s Check-outs')).toBeVisible();
  });
});
```

### 6. Rooms Page Integration
**File:** `e2e/rooms-check-ins.spec.ts`

```typescript
test.describe('Rooms Page Check-ins Integration', () => {
  test('should display guest info for occupied rooms', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to rooms
    await page.click('a[href="/rooms"]');

    // Look for occupied room with guest name
    const occupiedRoom = page.locator('tr:has(div:has-text("Occupied"))').first();
    await expect(occupiedRoom).toBeVisible();

    // Click on guest name to view check-in details
    const guestLink = occupiedRoom.locator('button[class*="text-blue"]');
    if (await guestLink.count() > 0) {
      await guestLink.click();

      // Verify check-in details modal
      await expect(page.locator('text=Check-in Details')).toBeVisible();
    }
  });
});
```

### 7. Filters and Search
**File:** `e2e/check-ins-filters.spec.ts`

```typescript
test.describe('Check-ins Filters and Search', () => {
  test('should filter check-ins by status', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.click('a[href="/check-ins"]');

    // Filter by checked_in
    await page.selectOption('select', 'checked_in');

    // Verify only checked-in guests shown
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should search check-ins by guest name', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@hotel.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.click('a[href="/check-ins"]');

    // Search for guest
    await page.fill('input[placeholder*="guest name"]', 'John');

    // Verify results filtered
    await expect(page.locator('tbody tr')).toBeVisible();
  });
});
```

## Test Data Setup

### Database Seed for E2E Tests
Create `backend/database/seeds/test/e2e_check_ins.ts`:
```typescript
export async function seed(knex: Knex): Promise<void> {
  // Insert test hotel
  const [hotel] = await knex('hotels')
    .insert({ hotel_name: 'Test Hotel', ... })
    .returning('*');

  // Insert test user
  const [user] = await knex('users')
    .insert({ email: 'admin@hotel.com', ... })
    .returning('*');

  // Insert test guest
  const [guest] = await knex('guests')
    .insert({ name: 'John Doe', ... })
    .returning('*');

  // Insert test room
  const [room] = await knex('rooms')
    .insert({ room_number: '101', ... })
    .returning('*');

  // Insert test reservation
  const [reservation] = await knex('reservations')
    .insert({
      hotel_id: hotel.id,
      primary_guest_id: guest.id,
      room_id: room.id,
      status: 'Confirmed',
      ...
    })
    .returning('*');
}
```

## Running E2E Tests

### Playwright
```bash
# Run all tests
npx playwright test

# Run tests in headed mode
npx playwright test --headed

# Run specific test file
npx playwright test e2e/check-in-workflow.spec.ts

# Debug tests
npx playwright test --debug

# Generate report
npx playwright show-report
```

### Cypress
```bash
# Open Cypress UI
npx cypress open

# Run tests headless
npx cypress run

# Run specific test
npx cypress run --spec "cypress/e2e/check-in-workflow.cy.js"
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend && npm install
          cd ../frontend && npm install
      
      - name: Setup database
        run: |
          cd backend
          npm run db:migrate
          npm run db:seed
      
      - name: Start backend
        run: cd backend && npm start &
      
      - name: Start frontend
        run: cd frontend && npm run dev &
      
      - name: Run E2E tests
        run: npx playwright test
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Coverage Goals

Target E2E coverage:
- All critical user journeys covered
- All happy paths tested
- Key error scenarios tested
- Cross-browser compatibility verified

## Priority

1. **Critical:** Complete check-in workflow, checkout workflow
2. **High:** Room change, check-in details view
3. **Medium:** Dashboard and rooms integration
4. **Low:** Filters, search, sorting

## Best Practices

1. Use test fixtures for common setup
2. Implement page object model for reusability
3. Mock time for date-dependent tests
4. Use data-testid attributes for stable selectors
5. Clean up test data after each test
6. Run tests in isolation (no dependencies between tests)
7. Implement retry logic for flaky tests
8. Use screenshots/videos for debugging failures



