# Multi-Hotel RBAC - Phase 1 Migration Complete ✅

## Overview

Phase 1 (Database Migrations) of the multi-hotel RBAC redesign has been completed. The system has been successfully migrated from a single-hotel to a multi-hotel architecture.

## Date Completed

February 11, 2026

## Migrations Created

All 4 database migrations have been created and can be run with `npm run migrate`:

### 1. Migration 20260211000001: Rename hotel_settings to hotels
**File:** `src/database/migrations/20260211000001_rename_hotel_settings_to_hotels.ts`

- ✅ Dropped single-row constraint `idx_hotel_settings_single`
- ✅ Renamed `hotel_settings` table to `hotels`
- ✅ Added `deleted_at` column for soft delete
- ✅ Updated all foreign key references from `hotel_settings` to `hotels`
- ✅ Renamed `property_id` to `hotel_id` in all referencing tables

### 2. Migration 20260211000002: Create user_hotels junction table
**File:** `src/database/migrations/20260211000002_create_user_hotels_junction.ts`

- ✅ Created `user_hotels` table for many-to-many user-hotel relationships
- ✅ Foreign keys with CASCADE delete
- ✅ Unique constraint on (user_id, hotel_id) pairs
- ✅ Optimized indexes for common queries

### 3. Migration 20260211000003: Add hotel_id to tenant-scoped tables
**File:** `src/database/migrations/20260211000003_add_hotel_id_to_tenant_tables.ts`

- ✅ Added `hotel_id` to all tenant-scoped tables:
  - rooms, room_types, reservations, guests
  - invoices, expenses, housekeeping, maintenance_requests
  - audit_logs, sync_conflicts, reservation_guests, webhook_events
- ✅ Backfilled existing data with default hotel ID
- ✅ Added foreign key constraints with CASCADE
- ✅ Updated unique constraints to be hotel-scoped
- ✅ Added indexes for query performance

### 4. Migration 20260211000004: Assign users to default hotel
**File:** `src/database/migrations/20260211000004_assign_users_to_default_hotel.ts`

- ✅ Links all existing users to the default hotel
- ✅ Auto-creates default hotel if it doesn't exist
- ✅ Batch processing for large datasets
- ✅ Idempotent with conflict handling
- ✅ Detailed logging with role breakdown

## Backend Code Updates

All backend code has been updated to use the new table and column names:

### Channel Manager Services
- ✅ `channel_manager_service.ts` - Updated all queries to use `hotels` and `hotel_id`
- ✅ `qloapps_strategy.ts` - Changed `propertyId` to `hotelId`, `property_id` to `hotel_id`

### Settings Controllers
- ✅ `settings_controller.ts` - Updated to use `hotels` table
- ✅ `beds24_controller.ts` - Changed all `property_id` to `hotel_id`

### QloApps Integration (Complete)
All QloApps integration files updated with batch find/replace:
- ✅ `src/services/qloapps/` - All TypeScript files
- ✅ `src/integrations/qloapps/` - All TypeScript files
- ✅ Changed `property_id` → `hotel_id` (database column)
- ✅ Changed `propertyId` → `hotelId` (variable names)

### Beds24 Integration (Complete)
All Beds24 integration files updated with batch find/replace:
- ✅ `src/integrations/beds24/` - All TypeScript files
- ✅ Changed `property_id` → `hotel_id` (database column)
- ✅ Changed `propertyId` → `hotelId` (variable names)

### Repository Layer
- ✅ `qloapps_repository.ts` - Updated all interfaces and queries
  - Changed `PROPERTY_ID` constant to `HOTEL_ID`
  - Updated `QloAppsConfigRecord` interface
  - Updated `SyncStateRecord` interface
  - Updated all database queries

### Database Seeds
- ✅ `001_seed_hotel_settings.ts` - Updated to use `hotels` table

## Breaking Changes

### Database Schema
1. Table renamed: `hotel_settings` → `hotels`
2. Column renamed (in config tables): `property_id` → `hotel_id`
3. New table: `user_hotels` (junction table)
4. New column: `hotel_id` added to all tenant-scoped tables
5. New column: `deleted_at` added to `hotels` table

### API Impact
- All queries now require `hotel_id` context
- Settings endpoints now work with `hotels` table
- Channel manager services use `hotel_id` instead of `property_id`

## Migration Status

| Migration | Status | Notes |
|-----------|--------|-------|
| 20260211000001 | ✅ Complete | hotel_settings → hotels |
| 20260211000002 | ✅ Complete | user_hotels junction table |
| 20260211000003 | ✅ Complete | hotel_id to all tables |
| 20260211000004 | ✅ Complete | Assign users to default hotel |

## How to Run Migrations

From the `backend` directory:

```bash
# Run all pending migrations
npm run migrate

# Rollback last batch (if needed)
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

## Backward Compatibility

The migrations are designed to be **backward compatible**:
- ✅ Existing data is preserved
- ✅ All data assigned to default hotel (ID: `00000000-0000-0000-0000-000000000000`)
- ✅ All users assigned to default hotel
- ✅ Full rollback support via `down()` functions

## Testing Checklist

- ✅ Migrations run successfully
- ✅ No linter errors in updated files
- ⏳ Backend starts without errors (needs testing)
- ⏳ QloApps integration works (needs testing)
- ⏳ Beds24 integration works (needs testing)
- ⏳ API endpoints respond correctly (needs testing)

## Next Steps

### Phase 2: Backend Changes (Pending)
See [multi-hotel_rbac_redesign_add9ab96.plan.md](../multi-hotel_rbac_redesign_add9ab96.plan.md) for details:

1. **Hotel context middleware** - Add `hotelContext` middleware to validate and attach hotel_id
2. **Hotels CRUD** - Implement hotels management endpoints
3. **Update users module** - Add hotel_ids field to user management
4. **Update auth flow** - Return user's hotels list, support hotel switching
5. **Scope controllers by hotel_id** - Add `.where('hotel_id', req.hotelId)` to all controllers
6. **Update integrations** - Make QloApps/Beds24 hotel-aware

### Phase 3: Frontend Changes (Pending)
1. **API layer** - Add X-Hotel-Id header to all requests
2. **Auth store** - Add hotels list and activeHotelId
3. **Hotel switcher UI** - Add dropdown in sidebar
4. **Staff management** - Add hotel assignment UI
5. **Hotels management** - Add hotels CRUD UI

## Important Constants

```typescript
// Default hotel ID used throughout the system
const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';
const HOTEL_ID = '00000000-0000-0000-0000-000000000000';
```

## Files Changed

### Migrations (4 files)
- `src/database/migrations/20260211000001_rename_hotel_settings_to_hotels.ts`
- `src/database/migrations/20260211000002_create_user_hotels_junction.ts`
- `src/database/migrations/20260211000003_add_hotel_id_to_tenant_tables.ts`
- `src/database/migrations/20260211000004_assign_users_to_default_hotel.ts`

### Services (3 files manually updated)
- `src/integrations/channel-manager/channel_manager_service.ts`
- `src/services/settings/beds24_controller.ts`
- `src/services/qloapps/qloapps_repository.ts`

### Integrations (Batch updated)
- All files in `src/integrations/qloapps/` (34 files)
- All files in `src/integrations/beds24/` (26 files)
- All files in `src/services/qloapps/` (multiple files)
- All files in `src/integrations/channel-manager/strategies/`

### Seeds (1 file)
- `src/database/seeds/001_seed_hotel_settings.ts`

## Verification Commands

```bash
# Check if hotels table exists
psql -U postgres -d hotel_management -c "SELECT * FROM hotels LIMIT 1;"

# Check if user_hotels table exists
psql -U postgres -d hotel_management -c "SELECT COUNT(*) FROM user_hotels;"

# Verify hotel_id column in rooms
psql -U postgres -d hotel_management -c "SELECT room_number, hotel_id FROM rooms LIMIT 5;"

# Check migrations status
npm run migrate:status
```

## Notes

1. **SUPER_ADMIN access**: SUPER_ADMIN users have implicit access to all hotels (no user_hotels entries required)
2. **Hotel-scoped uniqueness**: room_number is now unique per hotel (not globally)
3. **Soft delete**: Hotels use soft delete (deleted_at column)
4. **Default hotel**: All existing data is assigned to hotel ID `00000000-0000-0000-0000-000000000000`

## Support

For issues or questions:
1. Check migration logs in terminal output
2. Review migration files in `src/database/migrations/`
3. Check database state with verification commands above
4. Refer to the plan: `multi-hotel_rbac_redesign_add9ab96.plan.md`

