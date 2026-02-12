# Channel Manager Agnostic Backend Update

## Overview
This document describes the backend changes made to support channel manager agnostic naming conventions. The system now uses `cm_*` prefixes instead of `beds24_*` to support any channel manager integration, not just Beds24.

## Migration Required

### Database Migration
**File**: `src/database/migrations/20260212000001_rename_beds24_room_id_to_cm_room_id.ts`

This migration renames the `beds24_room_id` column to `cm_room_id` in both `room_types` and `rooms` tables.

**To apply**:
```bash
npm run migrate:latest
```

**To rollback**:
```bash
npm run migrate:rollback
```

## Changes Summary

### 1. Database Schema
- **room_types table**: `beds24_room_id` → `cm_room_id`
- **rooms table**: `beds24_room_id` → `cm_room_id`
- **Index renamed**: `idx_room_types_beds24_room_id` → `idx_room_types_cm_room_id`

### 2. Type Definitions

#### `/src/services/room_types/room_types_types.ts`
- `beds24_room_id` → `cm_room_id` in all interfaces

#### `/src/services/rooms/rooms_types.ts`
- `beds24_room_id` → `cm_room_id`
- Comment updated: "Beds24 integration" → "Channel Manager integration"

### 3. Controllers

#### `/src/services/room_types/room_types_controller.ts`
- Updated create and update operations to use `cm_room_id`

#### `/src/services/settings/beds24_rooms_controller.ts`
- Database query updated to select `cm_room_id as beds24_room_id` (maintains backward compatibility for Beds24-specific API)

### 4. Integration Services (Beds24)

All Beds24 integration services have been updated to query the new `cm_room_id` column:

- `/src/integrations/beds24/services/pull_sync_service.ts`
- `/src/integrations/beds24/services/reservation_push_service.ts`
- `/src/integrations/beds24/services/room_sync_service.ts`
- `/src/integrations/beds24/services/availability_push_service.ts`
- `/src/integrations/beds24/services/initial_sync_service.ts`
- `/src/integrations/beds24/webhooks/handlers/booking_created_handler.ts`
- `/src/integrations/beds24/webhooks/handlers/booking_modified_handler.ts`
- `/src/integrations/beds24/hooks/sync_hooks.ts`

**Note**: These files maintain their internal `beds24RoomId` variable names but query the database using the new `cm_room_id` column.

### 5. Migration Comments

#### `/src/database/migrations/20251226000021_create_room_types.ts`
- Updated comments to use "CM-style" instead of "Beds24-style"
- Comment updated: "Beds24 room type enum" → "Channel Manager room type enum"
- Added note: "Channel Manager room ID (legacy: beds24_room_id)"

## Backward Compatibility

### Beds24 Integration
The Beds24 integration continues to work seamlessly because:
1. The database column is renamed but the semantics remain the same
2. Integration services now query `cm_room_id` instead of `beds24_room_id`
3. The `beds24_rooms_controller` uses SQL aliasing (`cm_room_id as beds24_room_id`) to maintain API compatibility

### QloApps Integration
The QloApps integration uses separate mapping tables and is not affected by this change.

## Benefits

1. **Channel Manager Agnostic**: The system no longer assumes Beds24 as the only channel manager
2. **Consistent Naming**: Aligns with frontend changes (cmRoomId instead of beds24RoomId)
3. **Future-Proof**: Easy to add support for other channel managers
4. **Maintains Compatibility**: Existing integrations continue to work without breaking changes

## Testing Checklist

- [ ] Run migration successfully
- [ ] Verify room types can be created/updated
- [ ] Test Beds24 sync (if configured)
- [ ] Test QloApps sync (if configured)
- [ ] Verify reservations can be created with room types
- [ ] Check that room availability calculations work
- [ ] Test webhook handlers (if Beds24 is configured)

## Rollback Plan

If issues occur, rollback the migration:
```bash
npm run migrate:rollback
```

This will:
1. Rename `cm_room_id` back to `beds24_room_id` in both tables
2. Recreate the original index
3. Restore the previous schema

Note: You'll also need to revert the code changes to use `beds24_room_id` again.

