# Multi-Hotel RBAC System - Manual Testing Plan

**Version:** 1.0  
**Date:** February 2026  
**Status:** Testing Guide for Multi-Hotel Implementation

---

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Database Verification Tests](#database-verification-tests)
3. [Backend API Tests](#backend-api-tests)
4. [Frontend UI Tests](#frontend-ui-tests)
5. [RBAC Permission Tests](#rbac-permission-tests)
6. [Data Isolation Tests](#data-isolation-tests)
7. [Hotel Switching Tests](#hotel-switching-tests)
8. [Edge Case Tests](#edge-case-tests)
9. [Integration Tests](#integration-tests)
10. [Performance & Stress Tests](#performance--stress-tests)

---

## Test Environment Setup

### Prerequisites

1. **Database**: PostgreSQL with all migrations applied
2. **Backend**: Running on `http://localhost:3000`
3. **Frontend**: Running on `http://localhost:5173`
4. **Test Data**: Seed data with multiple hotels, users, and entities

### Test Data Requirements

Create the following test data:

#### Hotels
- **Hotel A** (Luxury Resort)
- **Hotel B** (Budget Inn)
- **Hotel C** (Business Hotel)

#### Users
- **Super Admin** (access to all hotels)
- **Admin Hotel A** (admin access to Hotel A only)
- **Admin Hotel B** (admin access to Hotel B only)
- **Manager Multi** (manager access to Hotels A and B)
- **Front Desk A** (front desk access to Hotel A only)
- **Viewer B** (viewer access to Hotel B only)
- **No Access User** (no hotels assigned)

#### Sample Data per Hotel
- 5-10 rooms/room types
- 10-15 reservations (past, current, future)
- 10+ guests
- 5+ invoices
- 3+ maintenance requests
- 5+ expenses

---

## Database Verification Tests

### Test 1.1: Schema Migration Verification

**Purpose**: Verify all database schema changes are applied correctly.

**Steps**:
1. Connect to PostgreSQL: `psql -U postgres -d hotelmanagement`
2. Verify `hotels` table exists (renamed from `hotel_settings`):
   ```sql
   \d hotels
   ```
   ✅ Should show: id, hotel_name, address, city, country, phone, email, etc., deleted_at

3. Verify `user_hotels` junction table exists:
   ```sql
   \d user_hotels
   ```
   ✅ Should show: id, user_id, hotel_id, created_at with unique constraint

4. Verify `hotel_id` column on all tenant-scoped tables:
   ```sql
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'rooms' AND column_name = 'hotel_id';
   ```
   ✅ Should return: hotel_id, uuid, NO

5. Repeat step 4 for tables: `room_types`, `reservations`, `guests`, `invoices`, `expenses`, `maintenance_requests`, `housekeeping`, `audit_logs`, `notifications`, `qloapps_config`

**Expected Results**:
- All tables have `hotel_id` column (NOT NULL, UUID type)
- Foreign key constraints are in place
- No single-row constraint on hotels table

---

### Test 1.2: Data Migration Verification

**Purpose**: Verify existing data was migrated correctly.

**Steps**:
1. Check all existing data has the default hotel ID:
   ```sql
   SELECT DISTINCT hotel_id FROM rooms;
   SELECT DISTINCT hotel_id FROM reservations;
   SELECT DISTINCT hotel_id FROM guests;
   ```
   ✅ All should return the same default hotel UUID

2. Verify all existing users are assigned to the default hotel:
   ```sql
   SELECT u.email, uh.hotel_id, h.hotel_name
   FROM users u
   LEFT JOIN user_hotels uh ON u.id = uh.user_id
   LEFT JOIN hotels h ON uh.hotel_id = h.id;
   ```
   ✅ All users should have at least one hotel assignment

3. Check referential integrity:
   ```sql
   -- Should return 0 (no orphaned records)
   SELECT COUNT(*) FROM rooms WHERE hotel_id NOT IN (SELECT id FROM hotels);
   SELECT COUNT(*) FROM reservations WHERE hotel_id NOT IN (SELECT id FROM hotels);
   ```
   ✅ All counts should be 0

**Expected Results**:
- No orphaned records
- All existing data assigned to default hotel
- All existing users have hotel access

---

## Backend API Tests

### Test 2.1: Hotel Context Middleware

**Purpose**: Verify the `X-Hotel-Id` header is required and validated.

**Test Case 2.1.1: Missing Hotel Header**

```bash
# Request without X-Hotel-Id header
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer YOUR_TOKEN"
```

✅ **Expected**: 400 Bad Request - "X-Hotel-Id header is required"

---

**Test Case 2.1.2: Invalid Hotel ID**

```bash
# Request with non-existent hotel ID
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Hotel-Id: 00000000-0000-0000-0000-000000000999"
```

✅ **Expected**: 404 Not Found - "Hotel not found"

---

**Test Case 2.1.3: No Access to Hotel**

```bash
# User A requesting Hotel B data (user has no access to Hotel B)
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer HOTEL_A_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_B_UUID"
```

✅ **Expected**: 403 Forbidden - "Access denied to this hotel"

---

**Test Case 2.1.4: Valid Hotel Access**

```bash
# User A requesting Hotel A data
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer HOTEL_A_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID"
```

✅ **Expected**: 200 OK with hotel A's rooms

---

**Test Case 2.1.5: SUPER_ADMIN Bypass**

```bash
# Super admin requesting any hotel
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "X-Hotel-Id: ANY_HOTEL_UUID"
```

✅ **Expected**: 200 OK with the hotel's rooms (super admin has implicit access)

---

### Test 2.2: Hotels CRUD API

**Test Case 2.2.1: List User's Hotels**

```bash
# GET /v1/hotels
curl -X GET http://localhost:3000/api/v1/hotels \
  -H "Authorization: Bearer USER_TOKEN"
```

✅ **Expected**: 200 OK with list of hotels the user has access to

```json
[
  {
    "id": "hotel-uuid-1",
    "hotel_name": "Luxury Resort",
    "city": "Miami",
    "country": "USA"
  }
]
```

---

**Test Case 2.2.2: Get Single Hotel**

```bash
# GET /v1/hotels/:id
curl -X GET http://localhost:3000/api/v1/hotels/HOTEL_UUID \
  -H "Authorization: Bearer USER_TOKEN"
```

✅ **Expected**: 200 OK with hotel details (if user has access)  
✅ **Expected**: 403 Forbidden (if user has no access)

---

**Test Case 2.2.3: Create Hotel (ADMIN)**

```bash
# POST /v1/hotels
curl -X POST http://localhost:3000/api/v1/hotels \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel_name": "New Beach Resort",
    "address": "123 Beach St",
    "city": "San Diego",
    "country": "USA",
    "phone": "+1-555-0100",
    "email": "info@beachresort.com",
    "currency": "USD",
    "timezone": "America/Los_Angeles",
    "check_in_time": "15:00:00",
    "check_out_time": "11:00:00"
  }'
```

✅ **Expected**: 201 Created with new hotel object  
✅ **Expected**: 403 Forbidden (if non-admin tries)

---

**Test Case 2.2.4: Update Hotel**

```bash
# PUT /v1/hotels/:id
curl -X PUT http://localhost:3000/api/v1/hotels/HOTEL_UUID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel_name": "Updated Hotel Name",
    "phone": "+1-555-9999"
  }'
```

✅ **Expected**: 200 OK with updated hotel object

---

**Test Case 2.2.5: Delete Hotel (Soft Delete)**

```bash
# DELETE /v1/hotels/:id
curl -X DELETE http://localhost:3000/api/v1/hotels/HOTEL_UUID \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

✅ **Expected**: 204 No Content  
✅ **Expected**: Hotel is soft-deleted (deleted_at is set)  
✅ **Expected**: 403 Forbidden (if non-super-admin tries)

---

### Test 2.3: User Hotel Assignment API

**Test Case 2.3.1: Create User with Hotel Assignment**

```bash
# POST /v1/users
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newstaff@hotel.com",
    "password": "SecurePass123",
    "first_name": "John",
    "last_name": "Doe",
    "role": "FRONT_DESK",
    "is_active": true,
    "hotel_ids": ["HOTEL_A_UUID", "HOTEL_B_UUID"]
  }'
```

✅ **Expected**: 201 Created  
✅ **Verify**: Check `user_hotels` table has 2 rows for this user

---

**Test Case 2.3.2: Update User Hotel Assignment**

```bash
# PUT /v1/users/:id
curl -X PUT http://localhost:3000/api/v1/users/USER_UUID \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel_ids": ["HOTEL_C_UUID"]
  }'
```

✅ **Expected**: 200 OK  
✅ **Verify**: User now only has access to Hotel C

---

**Test Case 2.3.3: Get User with Hotels**

```bash
# GET /v1/users/:id
curl -X GET http://localhost:3000/api/v1/users/USER_UUID \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

✅ **Expected**: 200 OK with `hotel_ids` array in response

```json
{
  "id": "user-uuid",
  "email": "staff@hotel.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "FRONT_DESK",
  "hotel_ids": ["hotel-uuid-1", "hotel-uuid-2"]
}
```

---

### Test 2.4: Auth Flow with Hotels

**Test Case 2.4.1: Login Returns Hotels**

```bash
# POST /auth/login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@hotel.com",
    "password": "password123"
  }'
```

✅ **Expected**: 200 OK with hotels list

```json
{
  "user": {
    "id": "user-uuid",
    "email": "manager@hotel.com",
    "first_name": "Jane",
    "last_name": "Manager",
    "role": "MANAGER"
  },
  "token": "jwt-token",
  "refreshToken": "refresh-token",
  "hotels": [
    {
      "id": "hotel-uuid-1",
      "hotel_name": "Luxury Resort",
      "city": "Miami"
    },
    {
      "id": "hotel-uuid-2",
      "hotel_name": "Budget Inn",
      "city": "Orlando"
    }
  ],
  "activeHotelId": "hotel-uuid-1"
}
```

---

**Test Case 2.4.2: Me Endpoint Returns Hotels**

```bash
# GET /auth/me
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer USER_TOKEN"
```

✅ **Expected**: 200 OK with user info and hotels list

---

### Test 2.5: Data Isolation Tests (Backend)

**Test Case 2.5.1: Rooms - Scoped by Hotel**

```bash
# Create room in Hotel A
curl -X POST http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "room_number": "A101",
    "type": "Single",
    "room_type": "single",
    "price_per_night": 100,
    "floor": 1
  }'

# Try to get rooms from Hotel B (should not see Hotel A's room)
curl -X GET http://localhost:3000/api/v1/rooms \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_B_UUID"
```

✅ **Expected**: Room A101 not visible in Hotel B's rooms list

---

**Test Case 2.5.2: Reservations - Cannot Access Cross-Hotel**

```bash
# Get reservation from Hotel A
curl -X GET http://localhost:3000/api/v1/reservations/RESERVATION_A_UUID \
  -H "Authorization: Bearer HOTEL_A_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID"
```

✅ **Expected**: 200 OK with reservation

```bash
# Try to access same reservation using Hotel B context
curl -X GET http://localhost:3000/api/v1/reservations/RESERVATION_A_UUID \
  -H "Authorization: Bearer HOTEL_B_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_B_UUID"
```

✅ **Expected**: 404 Not Found (reservation belongs to different hotel)

---

**Test Case 2.5.3: Guests - Scoped by Hotel**

```bash
# Create guest in Hotel A
curl -X POST http://localhost:3000/api/v1/guests \
  -H "Authorization: Bearer HOTEL_A_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Smith",
    "email": "alice@example.com",
    "phone": "+1-555-1234"
  }'

# Search for guest in Hotel B
curl -X GET "http://localhost:3000/api/v1/guests?search=alice" \
  -H "Authorization: Bearer HOTEL_B_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_B_UUID"
```

✅ **Expected**: No results (guests are hotel-scoped)

---

**Test Case 2.5.4: Reports - Only Hotel's Data**

```bash
# Get stats for Hotel A
curl -X GET http://localhost:3000/api/v1/reports/stats \
  -H "Authorization: Bearer HOTEL_A_USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID"
```

✅ **Expected**: Statistics only include Hotel A's data  
✅ **Verify**: Total rooms, reservations, revenue match Hotel A's data only

---

### Test 2.6: Settings - Per-Hotel Configuration

**Test Case 2.6.1: Get Hotel Settings**

```bash
# GET /v1/settings (returns settings for the hotel in X-Hotel-Id header)
curl -X GET http://localhost:3000/api/v1/settings \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID"
```

✅ **Expected**: 200 OK with Hotel A's settings (not other hotels)

---

**Test Case 2.6.2: Update Hotel Settings**

```bash
# PUT /v1/settings
curl -X PUT http://localhost:3000/api/v1/settings \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "check_in_time": "14:00:00",
    "tax_rate": 8.5
  }'
```

✅ **Expected**: 200 OK, settings updated for Hotel A only  
✅ **Verify**: Hotel B's settings remain unchanged

---

### Test 2.7: QloApps Integration - Per-Hotel

**Test Case 2.7.1: QloApps Config Per Hotel**

```bash
# Setup QloApps for Hotel A
curl -X POST http://localhost:3000/api/v1/qloapps/config \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "http://qloapps-a.com",
    "apiKey": "key-for-hotel-a",
    "qloAppsHotelId": 1
  }'

# Setup QloApps for Hotel B (different instance)
curl -X POST http://localhost:3000/api/v1/qloapps/config \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_B_UUID" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "http://qloapps-b.com",
    "apiKey": "key-for-hotel-b",
    "qloAppsHotelId": 1
  }'
```

✅ **Expected**: Each hotel has independent QloApps configuration

---

**Test Case 2.7.2: Sync Only Affects Target Hotel**

```bash
# Trigger sync for Hotel A
curl -X POST http://localhost:3000/api/v1/qloapps/sync \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "X-Hotel-Id: HOTEL_A_UUID" \
  -H "Content-Type: application/json" \
  -d '{"syncType": "reservations_inbound"}'
```

✅ **Expected**: Only Hotel A's data is synced  
✅ **Verify**: Hotel B's sync state unchanged  
✅ **Verify**: Sync logs show correct hotel_id

---

## Frontend UI Tests

### Test 3.1: Login and Hotel Selection

**Test Case 3.1.1: Login with Single Hotel**

**Steps**:
1. Log in as a user with access to only one hotel
2. After login, observe the UI

✅ **Expected**:
- Login successful
- User redirected to dashboard
- Hotel switcher shows the single hotel (no dropdown, just label)
- All data loads for that hotel

---

**Test Case 3.1.2: Login with Multiple Hotels**

**Steps**:
1. Log in as a user with access to multiple hotels
2. After login, observe the hotel switcher

✅ **Expected**:
- Login successful
- Hotel switcher dropdown visible in sidebar
- First hotel is active by default
- Dropdown shows all accessible hotels
- Dashboard shows data for the active hotel

---

**Test Case 3.1.3: Login with No Hotels**

**Steps**:
1. Log in as a user with no hotel assignments
2. Observe the behavior

✅ **Expected**:
- Login successful
- User sees "No hotels assigned" message
- Cannot access any pages
- Only logout option available

---

### Test 3.2: Hotel Switcher UI

**Test Case 3.2.1: Hotel Switcher Location**

**Steps**:
1. Log in and navigate to any page
2. Locate the hotel switcher

✅ **Expected**:
- Hotel switcher is visible in the sidebar header
- Below the "Hotel Manager" logo
- Above the navigation menu
- Shows current hotel name clearly

---

**Test Case 3.2.2: Switch Hotels**

**Steps**:
1. Log in as a multi-hotel user
2. Click on the hotel switcher dropdown
3. Select a different hotel
4. Observe the page behavior

✅ **Expected**:
- Dropdown shows all accessible hotels with names and cities
- Clicking a hotel triggers switch
- Loading indicator appears briefly
- Page data refreshes automatically
- New hotel name appears in the switcher
- All page data now reflects the new hotel

---

**Test Case 3.2.3: Hotel Switcher Persistence**

**Steps**:
1. Switch to Hotel B
2. Refresh the browser (F5)
3. Navigate to different pages

✅ **Expected**:
- Active hotel remains Hotel B after refresh
- All pages show Hotel B's data
- Hotel switcher shows Hotel B as active

---

**Test Case 3.2.4: Hotel Context in API Calls**

**Steps**:
1. Switch to Hotel A
2. Open browser DevTools → Network tab
3. Navigate to Rooms page
4. Observe the API request

✅ **Expected**:
- Request to `/api/v1/rooms` includes header: `X-Hotel-Id: <Hotel A UUID>`
- Response contains only Hotel A's rooms

---

### Test 3.3: Staff Management UI

**Test Case 3.3.1: Add Staff with Hotel Assignment**

**Steps**:
1. Log in as ADMIN
2. Go to Settings → Staff Management
3. Click "Add Staff Member"
4. Fill in staff details
5. Observe hotel assignment field

✅ **Expected**:
- Multi-select checkbox list for hotel assignment
- Shows all hotels the admin has access to
- SUPER_ADMIN sees all hotels
- Regular ADMIN sees only their hotels
- Can select multiple hotels
- Form submission creates user with correct hotel assignments

---

**Test Case 3.3.2: Edit Staff Hotel Assignment**

**Steps**:
1. Go to Settings → Staff Management
2. Click "Edit" on an existing staff member
3. Change hotel assignments
4. Save changes

✅ **Expected**:
- Current hotel assignments are pre-selected
- Can add/remove hotels
- Changes save correctly
- Staff list updates to show new assignments

---

**Test Case 3.3.3: View Staff Hotel Assignments**

**Steps**:
1. Go to Settings → Staff Management
2. Observe the staff table

✅ **Expected**:
- Table shows a "Hotels" column
- Displays hotel names (or badges) for each staff member
- Multi-hotel staff shows all assigned hotels (e.g., "Hotel A, Hotel B")

---

### Test 3.4: Hotels Management UI (ADMIN)

**Test Case 3.4.1: View Hotels List**

**Steps**:
1. Log in as ADMIN or SUPER_ADMIN
2. Go to Settings → Hotels tab

✅ **Expected**:
- Tab is visible only for ADMIN/SUPER_ADMIN
- Shows list of hotels
- Each hotel shows: name, city, country, status
- Action buttons: Edit, Delete (soft delete)

---

**Test Case 3.4.2: Create New Hotel**

**Steps**:
1. Go to Settings → Hotels
2. Click "Add Hotel"
3. Fill in hotel details:
   - Name: "Test Hotel"
   - Address, city, country
   - Phone, email
   - Check-in/out times
   - Currency, timezone
4. Submit form

✅ **Expected**:
- Form validates required fields
- Hotel created successfully
- Appears in hotels list
- Admin is automatically assigned to the new hotel
- Can switch to the new hotel immediately

---

**Test Case 3.4.3: Edit Hotel**

**Steps**:
1. Click "Edit" on a hotel
2. Modify hotel name and phone
3. Save changes

✅ **Expected**:
- Form pre-filled with current values
- Changes save successfully
- Updates reflect immediately

---

**Test Case 3.4.4: Delete Hotel (Soft Delete)**

**Steps**:
1. Click "Delete" on a hotel (SUPER_ADMIN only)
2. Confirm deletion
3. Observe the result

✅ **Expected**:
- Confirmation dialog appears
- Hotel is soft-deleted (not physically removed)
- Hotel no longer appears in lists
- Users assigned to that hotel only lose access
- If a user had only that hotel and it's deleted, they get "no hotels" message on next login

---

### Test 3.5: Data Isolation - Frontend Verification

**Test Case 3.5.1: Rooms Page - Hotel Scoping**

**Steps**:
1. Log in as multi-hotel user
2. Switch to Hotel A
3. Note the rooms displayed
4. Switch to Hotel B
5. Observe the rooms list

✅ **Expected**:
- Hotel A shows only its rooms
- Hotel B shows completely different rooms
- No overlap between the two lists
- Room numbers may overlap (A101 in both hotels) but are different entities

---

**Test Case 3.5.2: Reservations Page - Hotel Scoping**

**Steps**:
1. Switch to Hotel A
2. Go to Reservations page
3. Note the reservation count
4. Switch to Hotel B
5. Go to Reservations page

✅ **Expected**:
- Each hotel shows only its own reservations
- Reservation IDs are different
- Total counts are different
- Calendar view shows only the active hotel's bookings

---

**Test Case 3.5.3: Dashboard Stats - Hotel-Specific**

**Steps**:
1. Switch to Hotel A
2. Go to Dashboard
3. Note: Total rooms, occupancy rate, revenue
4. Switch to Hotel B
5. Go to Dashboard

✅ **Expected**:
- Dashboard stats recalculate for the active hotel
- Charts and graphs update to show hotel-specific data
- No mixing of data from different hotels

---

**Test Case 3.5.4: Settings Page - Independent Configuration**

**Steps**:
1. Switch to Hotel A
2. Go to Settings → Hotel Information
3. Note check-in time (e.g., 15:00)
4. Switch to Hotel B
5. Go to Settings → Hotel Information

✅ **Expected**:
- Each hotel has independent settings
- Check-in times can be different
- Currency, timezone are per-hotel
- QloApps configuration is per-hotel

---

## RBAC Permission Tests

### Test 4.1: Role-Based Hotel Access

**Test Case 4.1.1: SUPER_ADMIN - All Hotels Access**

**Steps**:
1. Log in as SUPER_ADMIN
2. Check hotel switcher dropdown

✅ **Expected**:
- Dropdown shows ALL hotels in the system
- Can switch to any hotel without restriction
- Can create/edit/delete hotels
- Can assign users to any hotel

---

**Test Case 4.1.2: ADMIN - Restricted Hotel Access**

**Steps**:
1. Log in as ADMIN assigned to Hotels A and B only
2. Check hotel switcher dropdown
3. Try to access Hotels management

✅ **Expected**:
- Dropdown shows only Hotels A and B
- Can manage users for Hotels A and B
- Cannot see or access Hotel C
- Can create users but only assign them to A or B

---

**Test Case 4.1.3: MANAGER - Multi-Hotel Access**

**Steps**:
1. Log in as MANAGER assigned to Hotels A and B
2. Navigate to various pages
3. Try to access staff management

✅ **Expected**:
- Can switch between Hotels A and B
- Can view/create reservations, guests, invoices
- Cannot access Staff Management (requires ADMIN)
- Cannot modify hotel settings

---

**Test Case 4.1.4: FRONT_DESK - Single Hotel Access**

**Steps**:
1. Log in as FRONT_DESK assigned to Hotel A only
2. Navigate to Reservations, Guests

✅ **Expected**:
- Hotel switcher shows only Hotel A (no dropdown if single hotel)
- Can create/view reservations and guests
- Cannot access Reports, Settings, Staff Management
- Cannot modify rooms or pricing

---

**Test Case 4.1.5: HOUSEKEEPING - Limited Access**

**Steps**:
1. Log in as HOUSEKEEPING assigned to Hotel A
2. Navigate to Rooms page
3. Try to access other pages

✅ **Expected**:
- Can access Rooms page (housekeeping tab)
- Can update room cleaning status
- Cannot create/edit rooms
- Cannot access Reservations, Guests, Settings

---

**Test Case 4.1.6: VIEWER - Read-Only Access**

**Steps**:
1. Log in as VIEWER assigned to Hotel B
2. Navigate to various pages
3. Try to create/edit any entity

✅ **Expected**:
- Can view all pages (Dashboard, Rooms, Reservations, etc.)
- All action buttons are disabled or hidden
- Cannot create, edit, or delete anything
- Cannot access Settings or Staff Management

---

### Test 4.2: Cross-Hotel Permission Tests

**Test Case 4.2.1: Cannot Access Unassigned Hotel Data**

**Steps**:
1. Log in as user assigned to Hotel A only
2. Manually change URL or API call to request Hotel B data
3. Try: `GET /api/v1/rooms` with `X-Hotel-Id: HOTEL_B_UUID` in DevTools

✅ **Expected**:
- API returns 403 Forbidden
- Frontend shows error message
- User cannot bypass hotel restrictions

---

**Test Case 4.2.2: Cannot Assign Hotels Beyond Own Access**

**Steps**:
1. Log in as ADMIN assigned to Hotel A
2. Go to Staff Management
3. Try to create a user and assign them to Hotel B (not accessible to this admin)

✅ **Expected**:
- Hotel B is not visible in the hotel assignment list
- Cannot assign users to hotels outside admin's scope
- Form validation prevents this

---

**Test Case 4.2.3: Multi-Hotel User Sees Correct Data**

**Steps**:
1. Log in as user assigned to Hotels A, B, and C
2. Switch between all three hotels
3. Verify data isolation

✅ **Expected**:
- Each hotel switch loads correct, isolated data
- No data leakage between hotels
- User can perform actions in all assigned hotels

---

## Data Isolation Tests

### Test 5.1: Guest Records Isolation

**Test Case 5.1.1: Same Email, Different Hotels**

**Steps**:
1. Switch to Hotel A
2. Create guest: "John Doe", email: "john@example.com"
3. Switch to Hotel B
4. Create guest: "John Doe", email: "john@example.com"
5. Search for "john@example.com" in both hotels

✅ **Expected**:
- Two separate guest records exist
- Each hotel sees only its own guest
- Guest IDs are different
- Reservations for John in Hotel A don't appear in Hotel B

---

### Test 5.2: Reservation Conflicts

**Test Case 5.2.1: Same Room Number, Different Hotels**

**Steps**:
1. Hotel A has Room "101"
2. Hotel B has Room "101" (different entity)
3. Create overlapping reservations for both rooms

✅ **Expected**:
- Both reservations succeed (no conflict)
- Room numbers can be the same across hotels
- Each hotel's availability calculation is independent

---

### Test 5.3: Reports and Statistics

**Test Case 5.3.1: Revenue Reports - Hotel-Specific**

**Steps**:
1. Switch to Hotel A
2. Go to Reports page
3. Generate revenue report for January 2026
4. Note the total revenue (e.g., $50,000)
5. Switch to Hotel B
6. Generate revenue report for January 2026

✅ **Expected**:
- Hotel B's report shows different revenue (e.g., $30,000)
- Reports do not aggregate across hotels
- Each hotel has independent financial tracking

---

### Test 5.4: Audit Logs

**Test Case 5.4.1: Audit Logs Per Hotel**

**Steps**:
1. Switch to Hotel A
2. Create a room
3. Go to Audit Logs page
4. Filter by "Room" actions
5. Switch to Hotel B
6. Go to Audit Logs

✅ **Expected**:
- Hotel A's audit logs show the room creation
- Hotel B's audit logs don't show Hotel A's actions
- Audit logs are hotel-scoped
- SUPER_ADMIN can see all hotel logs if they switch context

---

## Hotel Switching Tests

### Test 6.1: Smooth Switching Experience

**Test Case 6.1.1: Switch During Page Navigation**

**Steps**:
1. Log in as multi-hotel user
2. Navigate to Reservations page (Hotel A)
3. Switch to Hotel B using the switcher
4. Observe page behavior

✅ **Expected**:
- Reservations page automatically reloads with Hotel B data
- No manual navigation needed
- URL doesn't change (hotel context is in state/header)
- Loading indicator shows briefly during data fetch

---

**Test Case 6.1.2: Switch on Dashboard**

**Steps**:
1. On Dashboard showing Hotel A stats
2. Switch to Hotel B
3. Observe dashboard updates

✅ **Expected**:
- All stat cards update (rooms, occupancy, revenue)
- Charts redraw with Hotel B data
- No page errors or flickers
- Smooth transition

---

**Test Case 6.1.3: Switch While Creating Entity**

**Steps**:
1. Start creating a new reservation for Hotel A
2. Fill in form partially
3. Switch to Hotel B (without submitting)
4. Observe form behavior

✅ **Expected**:
- Form data is cleared (since context changed)
- User is warned about unsaved changes (if implemented)
- New reservation would be for Hotel B if submitted
- Room/guest dropdowns update to Hotel B entities

---

### Test 6.2: Browser Refresh After Switch

**Test Case 6.2.1: Persistence Test**

**Steps**:
1. Switch to Hotel B
2. Navigate to Rooms page
3. Refresh browser (F5)
4. Check active hotel

✅ **Expected**:
- Hotel B remains active after refresh
- Rooms page shows Hotel B's rooms
- Hotel switcher shows Hotel B selected
- No unexpected hotel switch to default

---

### Test 6.3: Concurrent Sessions

**Test Case 6.3.1: Multiple Browser Tabs**

**Steps**:
1. Open two browser tabs, both logged in as the same user
2. Tab 1: Switch to Hotel A
3. Tab 2: Switch to Hotel B
4. Observe both tabs independently

✅ **Expected**:
- Each tab maintains its own active hotel context
- Tab 1 shows Hotel A data
- Tab 2 shows Hotel B data
- No interference between tabs

---

### Test 6.4: Invalid Hotel Handling

**Test Case 6.4.1: Hotel Deleted While Active**

**Steps**:
1. Log in as user with Hotels A and B
2. Switch to Hotel B
3. SUPER_ADMIN deletes Hotel B (in another session)
4. User tries to perform an action in Hotel B

✅ **Expected**:
- API returns 403 or 404 error
- Frontend detects the error
- User is automatically switched to their first remaining hotel (Hotel A)
- Notification shown: "Hotel no longer accessible, switched to [Hotel A]"

---

## Edge Case Tests

### Test 7.1: User with No Hotels

**Test Case 7.1.1: Login Behavior**

**Steps**:
1. Create a new user with no hotel assignments
2. Log in as that user

✅ **Expected**:
- Login succeeds
- User sees "No hotels assigned" screen
- Only option is to logout
- Cannot access any application pages
- Contact admin message displayed

---

**Test Case 7.1.2: Hotel Assignment Added While Logged In**

**Steps**:
1. User with no hotels is logged in
2. ADMIN assigns Hotel A to this user (in another session)
3. User refreshes or attempts navigation

✅ **Expected**:
- User may need to log out and log back in
- OR system detects hotel list change and prompts re-authentication
- After re-login, user can access Hotel A

---

### Test 7.2: Single Hotel User

**Test Case 7.2.1: Simplified UI**

**Steps**:
1. Log in as user assigned to only Hotel A
2. Observe the hotel switcher UI

✅ **Expected**:
- No dropdown (since only one option)
- Simply displays hotel name as a label
- Cleaner UI for single-hotel users

---

### Test 7.3: All Hotels Deleted

**Test Case 7.3.1: Edge Case Handling**

**Steps**:
1. User has access to Hotels A and B
2. SUPER_ADMIN deletes both hotels
3. User is logged in and tries to navigate

✅ **Expected**:
- API calls fail with 403
- Frontend switches to "No hotels assigned" screen
- User must contact admin
- Logout option available

---

### Test 7.4: Malformed Hotel ID

**Test Case 7.4.1: Invalid UUID Format**

**Steps**:
1. Manually set `activeHotelId` in localStorage to "invalid-uuid"
2. Refresh page
3. Try to make API calls

✅ **Expected**:
- API returns 400 Bad Request
- Frontend detects invalid format
- Resets to first available hotel
- Or prompts user to select a hotel

---

### Test 7.5: Race Conditions

**Test Case 7.5.1: Rapid Hotel Switching**

**Steps**:
1. Rapidly switch between hotels multiple times (click dropdown 5-10 times quickly)
2. Observe page behavior

✅ **Expected**:
- No errors or crashes
- Last selected hotel wins
- Data loads correctly for final hotel
- No data mixing from different hotels

---

**Test Case 7.5.2: Switch During API Call**

**Steps**:
1. Trigger a slow API call (e.g., sync operation)
2. Immediately switch hotels
3. Observe behavior

✅ **Expected**:
- In-flight requests are canceled or ignored
- New hotel's data loads
- No stale data displayed
- No errors in console

---

### Test 7.6: Permission Escalation Attempts

**Test Case 7.6.1: Modify Request Header**

**Steps**:
1. Log in as FRONT_DESK user (Hotel A)
2. Use DevTools to intercept a request
3. Change `X-Hotel-Id` to a different hotel UUID
4. Send the modified request

✅ **Expected**:
- Backend validates user has access to the hotel
- Returns 403 Forbidden
- Cannot bypass security through header manipulation

---

**Test Case 7.6.2: JWT Token Manipulation**

**Steps**:
1. Copy JWT token from logged-in session
2. Attempt to decode and modify payload (add fake hotel access)
3. Use modified token

✅ **Expected**:
- Token signature validation fails
- Request rejected with 401 Unauthorized
- Security not compromised

---

## Integration Tests

### Test 8.1: End-to-End Reservation Flow

**Test Case 8.1.1: Full Booking Process - Multi-Hotel**

**Steps**:
1. Log in as MANAGER with Hotels A and B
2. Switch to Hotel A
3. Create guest "Alice Johnson"
4. Create reservation for Alice in Room 201, next week
5. View reservation in calendar
6. Switch to Hotel B
7. Verify Alice and her reservation are not visible
8. Switch back to Hotel A
9. Check-in Alice
10. Generate invoice
11. Mark invoice as paid

✅ **Expected**:
- All steps succeed without errors
- Data remains in Hotel A context
- Hotel B never sees this data
- Audit logs record all actions with correct hotel_id

---

### Test 8.2: QloApps Sync - Multi-Hotel

**Test Case 8.2.1: Independent Sync Per Hotel**

**Steps**:
1. Configure QloApps for Hotel A (different instance)
2. Configure QloApps for Hotel B (different instance)
3. Trigger sync for Hotel A
4. Verify sync completes
5. Check Hotel B's sync status

✅ **Expected**:
- Hotel A syncs with its QloApps instance
- Hotel B sync status unaffected
- Each hotel has independent sync logs
- No cross-contamination of data

---

### Test 8.3: Reporting Across Hotels (Super Admin)

**Test Case 8.3.1: Aggregated Reports**

**Steps**:
1. Log in as SUPER_ADMIN
2. Switch to Hotel A - note revenue
3. Switch to Hotel B - note revenue
4. Switch to Hotel C - note revenue
5. (Future feature) Generate company-wide report

✅ **Expected**:
- Currently: Each hotel report is separate
- Future: If aggregated reporting is added, verify correct totals
- No double-counting
- Proper hotel attribution in reports

---

## Performance & Stress Tests

### Test 9.1: Load Testing

**Test Case 9.1.1: Multiple Users, Multiple Hotels**

**Scenario**:
- 10 concurrent users
- Each user assigned to different hotels
- All performing CRUD operations simultaneously

**Steps**:
1. Use tool like Apache Bench or k6
2. Simulate concurrent API requests with different hotel contexts
3. Monitor response times and error rates

✅ **Expected**:
- Response times < 500ms for most operations
- No cross-hotel data leakage
- No database deadlocks
- All requests succeed with correct scoping

---

### Test 9.2: Hotel Switching Performance

**Test Case 9.2.1: Rapid Switching**

**Steps**:
1. User with 5 hotels
2. Script rapid hotel switching (switch every 1 second)
3. Measure page load times and data freshness

✅ **Expected**:
- Each switch completes in < 1 second
- No memory leaks in frontend
- No stale data displayed
- Backend handles rapid header changes gracefully

---

### Test 9.3: Large Dataset Tests

**Test Case 9.3.1: Hotel with 1000+ Reservations**

**Steps**:
1. Seed Hotel A with 1000 reservations
2. Switch to Hotel A
3. Navigate to Reservations page
4. Apply filters, search, pagination

✅ **Expected**:
- Page loads within acceptable time (< 2 seconds)
- Pagination works correctly
- Filters apply hotel scope correctly
- No performance degradation

---

## Testing Checklist

Use this checklist to track testing progress:

### Database
- [ ] Schema migrations applied successfully
- [ ] Data migration completed (existing data assigned to default hotel)
- [ ] Foreign key constraints working
- [ ] Junction table populated correctly

### Backend API
- [ ] Hotel context middleware functional
- [ ] All controllers scoped by hotel_id
- [ ] RBAC permissions enforced
- [ ] Hotels CRUD endpoints working
- [ ] User hotel assignment endpoints working
- [ ] Auth flow returns hotels list
- [ ] Data isolation verified across all entities
- [ ] QloApps integration hotel-scoped

### Frontend UI
- [ ] Hotel switcher visible and functional
- [ ] Login flow handles hotels correctly
- [ ] Staff management shows hotel assignments
- [ ] Hotels management tab functional (ADMIN)
- [ ] All pages refresh on hotel switch
- [ ] Data isolation verified in UI
- [ ] No access user sees appropriate message
- [ ] Permission-based UI elements working

### RBAC
- [ ] SUPER_ADMIN can access all hotels
- [ ] ADMIN restricted to assigned hotels
- [ ] MANAGER permissions correct
- [ ] FRONT_DESK permissions correct
- [ ] HOUSEKEEPING permissions correct
- [ ] VIEWER read-only access working
- [ ] Cross-hotel access denied correctly

### Edge Cases
- [ ] No hotels user handled gracefully
- [ ] Single hotel user UI simplified
- [ ] Hotel deletion handled correctly
- [ ] Invalid hotel ID rejected
- [ ] Race conditions handled
- [ ] Permission escalation prevented

### Integration
- [ ] End-to-end workflows tested
- [ ] QloApps sync per-hotel verified
- [ ] Audit logs hotel-scoped

### Performance
- [ ] Load testing passed
- [ ] Hotel switching performant
- [ ] Large dataset handling acceptable

---

## Test Results Template

Use this template to document test results:

```markdown
## Test Execution Report

**Date**: [Date]
**Tester**: [Name]
**Environment**: [Dev/Staging/Prod]
**Build Version**: [Version]

### Summary
- Total Tests: [Number]
- Passed: [Number]
- Failed: [Number]
- Blocked: [Number]

### Failed Tests

#### Test Case [ID]: [Name]
- **Expected**: [Description]
- **Actual**: [Description]
- **Severity**: [Critical/High/Medium/Low]
- **Steps to Reproduce**: [Steps]
- **Screenshots**: [If applicable]
- **Logs**: [Error messages]

### Notes
[Any additional observations]
```

---

## Conclusion

This comprehensive testing plan covers:
- ✅ **Core functionality**: Database, API, UI, RBAC
- ✅ **Data isolation**: Ensuring no cross-hotel data leakage
- ✅ **Edge cases**: Unusual scenarios and error handling
- ✅ **Security**: Permission checks and access control
- ✅ **Performance**: Load and stress testing
- ✅ **Integration**: End-to-end workflows

Execute these tests systematically after implementation to ensure the multi-hotel RBAC system works correctly and securely.

