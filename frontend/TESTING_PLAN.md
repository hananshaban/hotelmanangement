# Frontend Testing Plan for Check-ins Feature

## Overview
This document outlines the testing strategy for the check-ins feature frontend components. Testing infrastructure needs to be set up before implementing these tests.

## Testing Infrastructure Setup Required

### 1. Install Testing Dependencies
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### 2. Create Vitest Configuration
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

### 3. Create Test Setup File
Create `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

### 4. Update package.json
Add test script:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

## Test Files to Create

### 1. CheckInsPage Tests
**File:** `src/pages/__tests__/CheckInsPage.test.jsx`

**Test Cases:**
- Renders check-ins list correctly
- Filters check-ins by status
- Searches check-ins by guest name and room number
- Sorts check-ins by different criteria
- Opens checkout modal when clicking "Checkout" button
- Opens change room modal when clicking "Change Room" button
- Opens details modal when clicking "View" button
- Displays active check-ins stats correctly
- Displays "Checked Out Today" stats correctly
- Handles loading state
- Handles error state
- Handles empty state (no check-ins)

**Sample Test:**
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CheckInsPage from '../CheckInsPage';

// Mock stores
vi.mock('../../store/checkInsStore', () => ({
  default: () => ({
    checkIns: mockCheckIns,
    loading: false,
    error: null,
    fetchCheckIns: vi.fn(),
    checkOutGuest: vi.fn(),
    changeRoom: vi.fn(),
  }),
}));

describe('CheckInsPage', () => {
  it('renders check-ins list', async () => {
    render(
      <BrowserRouter>
        <CheckInsPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Check-ins')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('opens checkout modal when clicking checkout button', async () => {
    render(
      <BrowserRouter>
        <CheckInsPage />
      </BrowserRouter>
    );

    const checkoutButton = screen.getByRole('button', { name: /checkout/i });
    fireEvent.click(checkoutButton);

    await waitFor(() => {
      expect(screen.getByText('Checkout Guest')).toBeInTheDocument();
    });
  });
});
```

### 2. CheckInModal Tests
**File:** `src/components/__tests__/CheckInModal.test.jsx`

**Test Cases:**
- Renders modal with reservation details
- Fetches eligible rooms on mount
- Auto-selects preferred room if available
- Auto-selects single available room
- Validates room selection before check-in
- Submits check-in with correct data
- Handles check-in error
- Displays loading state while fetching rooms
- Displays error when no eligible rooms available
- Closes modal on cancel
- Closes modal after successful check-in

### 3. CheckInsStore Tests
**File:** `src/store/__tests__/checkInsStore.test.js`

**Test Cases:**
- fetchCheckIns: fetches and stores check-ins
- fetchCheckIns: handles API error
- fetchCheckIn: fetches single check-in by ID
- checkInGuest: creates check-in and refreshes list
- checkOutGuest: updates check-in status in store
- changeRoom: updates check-in room in store
- getEligibleRooms: returns eligible rooms list
- getActiveCheckIns: returns only checked-in guests
- getCheckInByRoom: returns check-in for specific room
- setFilters: updates filter state
- clearFilters: resets all filters

### 4. Integration Tests
**File:** `src/pages/__tests__/ReservationsCheckInFlow.test.jsx`

**Test Cases:**
- Complete flow: View reservation → Click check-in → Select room → Confirm
- Check-in button only appears for Confirmed reservations
- Check-in button does not appear for Cancelled/Checked-in reservations
- Reservation status updates after check-in
- Room assignment is created after check-in

### 5. RoomsPage Integration Tests
**File:** `src/pages/__tests__/RoomsPageCheckIns.test.jsx`

**Test Cases:**
- Displays guest name for occupied rooms
- Clicking guest name opens check-in details modal
- Check-in details modal shows correct information
- Empty state for rooms without check-ins

### 6. DashboardPage Integration Tests
**File:** `src/pages/__tests__/DashboardCheckInStats.test.jsx`

**Test Cases:**
- Displays active check-ins count
- Displays today's check-ins count
- Displays today's check-outs count
- Stats update when check-ins data changes

## Mock Data

Create `src/test/mocks/checkIns.js`:
```javascript
export const mockCheckIns = [
  {
    id: 'checkin-1',
    reservation_id: 'res-1',
    actual_room_id: 'room-101',
    room_number: '101',
    room_type_name: 'Deluxe King',
    guest_name: 'John Doe',
    guest_email: 'john@example.com',
    guest_phone: '+1234567890',
    check_in_time: '2024-01-15T14:00:00Z',
    expected_checkout_time: '2024-01-18T11:00:00Z',
    actual_checkout_time: null,
    status: 'checked_in',
    notes: 'Early check-in requested',
  },
  {
    id: 'checkin-2',
    reservation_id: 'res-2',
    actual_room_id: 'room-102',
    room_number: '102',
    room_type_name: 'Standard Queen',
    guest_name: 'Jane Smith',
    guest_email: 'jane@example.com',
    check_in_time: '2024-01-14T15:00:00Z',
    expected_checkout_time: '2024-01-16T11:00:00Z',
    actual_checkout_time: '2024-01-16T10:30:00Z',
    status: 'checked_out',
    notes: null,
  },
];
```

## Running Tests

After setup, run tests with:
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test:coverage

# Run tests with UI
npm test:ui
```

## Coverage Goals

Target coverage for check-ins feature:
- **Line Coverage:** 80%+
- **Branch Coverage:** 75%+
- **Function Coverage:** 80%+
- **Statement Coverage:** 80%+

## Priority

1. **High Priority:** CheckInsPage, CheckInModal, checkInsStore
2. **Medium Priority:** Integration tests for reservation check-in flow
3. **Low Priority:** Dashboard and RoomsPage integration tests

## Notes

- Mock API calls using vitest's `vi.fn()` and `vi.mock()`
- Use `@testing-library/user-event` for realistic user interactions
- Test accessibility with `@testing-library/jest-dom` assertions
- Mock date/time for consistent test results
- Isolate components in tests (mock child components if needed)


