# Check-ins API Documentation

## Overview
The Check-ins API provides endpoints to manage guest check-ins, checkouts, and room changes during a stay. It separates the concept of reservations (booking intent) from actual stays (check-ins).

**Base URL:** `/api/v1`

**Authentication:** All endpoints require a valid JWT token in the `Authorization` header.

**Multi-Hotel:** All endpoints require the `X-Hotel-Id` header to specify which hotel the operation is for.

---

## Endpoints

### 1. Create Check-in

Creates a new check-in record for a guest.

**Endpoint:** `POST /check-ins`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reservation_id": "uuid",
  "actual_room_id": "uuid",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "notes": "Guest requested early check-in"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "hotel_id": "uuid",
  "reservation_id": "uuid",
  "actual_room_id": "uuid",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "actual_checkout_time": null,
  "status": "checked_in",
  "notes": "Guest requested early check-in",
  "checked_in_by": "uuid",
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-15T14:00:00Z"
}
```

**Validation:**
- `reservation_id`: Required, must exist and be in 'Confirmed' status
- `actual_room_id`: Required, must exist and be available
- `check_in_time`: Required, ISO 8601 datetime
- `expected_checkout_time`: Required, ISO 8601 datetime
- `notes`: Optional, max 1000 characters

**Errors:**
- `400 Bad Request`: Invalid input data
- `404 Not Found`: Reservation or room not found
- `409 Conflict`: Room is not available or reservation already checked in

---

### 2. List Check-ins

Retrieves a list of check-ins with optional filters.

**Endpoint:** `GET /check-ins`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
```

**Query Parameters:**
- `status` (optional): Filter by status (`checked_in`, `checked_out`)
- `room_id` (optional): Filter by room ID
- `from_date` (optional): Filter check-ins after this date (ISO 8601)
- `to_date` (optional): Filter check-ins before this date (ISO 8601)
- `limit` (optional): Number of results per page (default: 50, max: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Example Request:**
```
GET /api/v1/check-ins?status=checked_in&limit=10&offset=0
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "hotel_id": "uuid",
    "reservation_id": "uuid",
    "actual_room_id": "uuid",
    "room_number": "101",
    "room_type_name": "Deluxe King",
    "guest_name": "John Doe",
    "guest_email": "john@example.com",
    "guest_phone": "+1234567890",
    "check_in_time": "2024-01-15T14:00:00Z",
    "expected_checkout_time": "2024-01-18T11:00:00Z",
    "actual_checkout_time": null,
    "status": "checked_in",
    "notes": "Early check-in requested",
    "checked_in_by": "uuid",
    "created_at": "2024-01-15T14:00:00Z",
    "updated_at": "2024-01-15T14:00:00Z"
  }
]
```

---

### 3. Get Check-in Details

Retrieves detailed information about a specific check-in, including reservation details, guest information, and room assignment history.

**Endpoint:** `GET /check-ins/:id`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "hotel_id": "uuid",
  "reservation_id": "uuid",
  "actual_room_id": "uuid",
  "room_number": "101",
  "room_type_name": "Deluxe King",
  "guest_name": "John Doe",
  "guest_email": "john@example.com",
  "guest_phone": "+1234567890",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "actual_checkout_time": null,
  "status": "checked_in",
  "notes": "Early check-in requested",
  "checked_in_by": "uuid",
  "reservation": {
    "id": "uuid",
    "check_in": "2024-01-15",
    "check_out": "2024-01-18",
    "status": "Checked-in",
    "total_price": 450.00
  },
  "room_assignments": [
    {
      "id": "uuid",
      "from_room_id": null,
      "to_room_id": "uuid",
      "to_room_number": "101",
      "assignment_type": "initial",
      "change_reason": null,
      "assigned_by": "uuid",
      "assigned_at": "2024-01-15T14:00:00Z"
    }
  ],
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-15T14:00:00Z"
}
```

**Errors:**
- `404 Not Found`: Check-in not found

---

### 4. Checkout Guest

Checks out a guest and updates room status.

**Endpoint:** `PATCH /check-ins/:id/checkout`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
Content-Type: application/json
```

**Request Body:**
```json
{
  "actual_checkout_time": "2024-01-18T10:30:00Z",
  "notes": "Guest checked out on time"
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "hotel_id": "uuid",
  "reservation_id": "uuid",
  "actual_room_id": "uuid",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "actual_checkout_time": "2024-01-18T10:30:00Z",
  "status": "checked_out",
  "notes": "Guest checked out on time",
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-18T10:30:00Z"
}
```

**Validation:**
- `actual_checkout_time`: Required, ISO 8601 datetime
- `notes`: Optional, max 1000 characters

**Side Effects:**
- Updates reservation status to 'Checked-out'
- Updates room status to 'Cleaning'
- Creates audit log entry

**Errors:**
- `400 Bad Request`: Check-in is not in 'checked_in' status
- `404 Not Found`: Check-in not found

---

### 5. Change Room

Changes the room assignment for an active check-in.

**Endpoint:** `POST /check-ins/:id/change-room`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
Content-Type: application/json
```

**Request Body:**
```json
{
  "new_room_id": "uuid",
  "assignment_type": "upgrade",
  "change_reason": "Guest requested room upgrade"
}
```

**Assignment Types:**
- `upgrade`: Guest upgraded to better room
- `downgrade`: Guest moved to lower category
- `maintenance`: Room change due to maintenance issue
- `guest_request`: Guest requested different room
- `other`: Other reason

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "hotel_id": "uuid",
  "reservation_id": "uuid",
  "actual_room_id": "uuid-new",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "actual_checkout_time": null,
  "status": "checked_in",
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-16T09:00:00Z"
}
```

**Validation:**
- `new_room_id`: Required, must exist and be available
- `assignment_type`: Required, one of the defined types
- `change_reason`: Optional, max 500 characters

**Side Effects:**
- Creates new room assignment record in audit trail
- Updates check-in's actual_room_id
- Sets old room status to 'Cleaning'
- Sets new room status to 'Occupied'
- Creates audit log entry

**Errors:**
- `400 Bad Request`: Invalid assignment type or check-in not active
- `404 Not Found`: Check-in or new room not found
- `409 Conflict`: New room is not available

---

### 6. Get Eligible Rooms for Check-in

Retrieves rooms eligible for check-in based on reservation constraints.

**Endpoint:** `GET /reservations/:reservationId/eligible-rooms`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "room_number": "101",
    "room_type_id": "uuid",
    "room_type_name": "Deluxe King",
    "status": "Available",
    "floor": 1,
    "features": ["WiFi", "TV", "Mini Bar"]
  },
  {
    "id": "uuid",
    "room_number": "102",
    "room_type_id": "uuid",
    "room_type_name": "Deluxe King",
    "status": "Available",
    "floor": 1,
    "features": ["WiFi", "TV", "Mini Bar"]
  }
]
```

**Filtering Logic:**
- Only returns rooms matching the reservation's room type (if specified)
- Excludes occupied rooms
- Excludes out-of-service rooms
- Prioritizes the originally reserved room (if available)

**Errors:**
- `404 Not Found`: Reservation not found

---

### 7. Check-in from Reservation (Convenience Endpoint)

Convenience endpoint that combines checking in a guest directly from a reservation.

**Endpoint:** `POST /reservations/:reservationId/check-in`

**Headers:**
```
Authorization: Bearer <token>
X-Hotel-Id: <hotel_id>
Content-Type: application/json
```

**Request Body:**
```json
{
  "actual_room_id": "uuid",
  "check_in_time": "2024-01-15T14:00:00Z",
  "notes": "Guest checked in early"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "hotel_id": "uuid",
  "reservation_id": "uuid",
  "actual_room_id": "uuid",
  "check_in_time": "2024-01-15T14:00:00Z",
  "expected_checkout_time": "2024-01-18T11:00:00Z",
  "actual_checkout_time": null,
  "status": "checked_in",
  "notes": "Guest checked in early",
  "checked_in_by": "uuid",
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-15T14:00:00Z"
}
```

**Note:** This is equivalent to calling `POST /check-ins` but uses the reservation ID in the path instead of the request body.

---

## Status Values

### Check-in Status
- `checked_in`: Guest is currently checked in
- `checked_out`: Guest has checked out

### Reservation Status (related)
- `Pending`: Reservation created, awaiting confirmation
- `Confirmed`: Reservation confirmed, ready for check-in
- `Checked-in`: Guest is checked in (reservation linked to check-in)
- `Checked-out`: Guest has checked out
- `Cancelled`: Reservation cancelled

### Room Status (related)
- `Available`: Room is ready for assignment
- `Occupied`: Room has a guest checked in
- `Cleaning`: Room is being cleaned
- `Out of Service`: Room unavailable due to maintenance

---

## RBAC Permissions

Required permissions for check-ins endpoints:

| Endpoint | Permission | Role |
|----------|-----------|------|
| `POST /check-ins` | `check_ins:create` | Front Desk, Manager, Admin |
| `GET /check-ins` | `check_ins:read` | All authenticated users |
| `GET /check-ins/:id` | `check_ins:read` | All authenticated users |
| `PATCH /check-ins/:id/checkout` | `check_ins:update` | Front Desk, Manager, Admin |
| `POST /check-ins/:id/change-room` | `check_ins:update` | Front Desk, Manager, Admin |
| `GET /reservations/:id/eligible-rooms` | `reservations:read` | All authenticated users |
| `POST /reservations/:id/check-in` | `check_ins:create` | Front Desk, Manager, Admin |

---

## Audit Logging

All check-in operations are automatically logged in the audit logs table:

- `check_in_created`: When a guest is checked in
- `check_in_updated`: When check-in details are updated
- `guest_checked_out`: When a guest is checked out
- `room_changed`: When a guest's room is changed

Each audit log entry includes:
- User who performed the action
- Hotel ID
- Entity type and ID
- Action performed
- Changes made (old/new values)
- Timestamp

---

## Error Responses

All endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "error": "Validation error message",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "actual_room_id",
    "message": "Room is not available"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid or missing authentication token",
  "code": "UNAUTHORIZED"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions to perform this action",
  "code": "FORBIDDEN"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND"
}
```

### 409 Conflict
```json
{
  "error": "Resource conflict",
  "code": "CONFLICT",
  "details": {
    "reason": "Reservation is already checked in"
  }
}
```

### 500 Internal Server Error
```json
{
  "error": "An unexpected error occurred",
  "code": "INTERNAL_ERROR"
}
```

---

## Rate Limiting

Check-ins API endpoints are subject to rate limiting:
- **Rate:** 100 requests per minute per user
- **Burst:** 200 requests in a short burst

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642261200
```

---

## Pagination

List endpoints support pagination using `limit` and `offset` parameters:

**Request:**
```
GET /api/v1/check-ins?limit=20&offset=40
```

**Response Headers:**
```
X-Total-Count: 150
X-Page-Size: 20
X-Page-Offset: 40
```

---

## Filtering Best Practices

1. **Date Filters:** Use ISO 8601 format (`YYYY-MM-DDTHH:mm:ssZ`)
2. **Status Filters:** Use exact status values (case-sensitive)
3. **Pagination:** Always specify a reasonable `limit` to avoid performance issues
4. **Sorting:** Results are sorted by `check_in_time DESC` by default

---

## Examples

### Example 1: Check in a guest from a confirmed reservation

```bash
# Step 1: Get eligible rooms
curl -X GET \
  https://api.hotel.com/api/v1/reservations/res-123/eligible-rooms \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Hotel-Id: hotel-123'

# Step 2: Check in the guest
curl -X POST \
  https://api.hotel.com/api/v1/reservations/res-123/check-in \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Hotel-Id: hotel-123' \
  -H 'Content-Type: application/json' \
  -d '{
    "actual_room_id": "room-101",
    "check_in_time": "2024-01-15T14:00:00Z",
    "notes": "Guest arrived early"
  }'
```

### Example 2: Change a guest's room

```bash
curl -X POST \
  https://api.hotel.com/api/v1/check-ins/checkin-123/change-room \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Hotel-Id: hotel-123' \
  -H 'Content-Type: application/json' \
  -d '{
    "new_room_id": "room-201",
    "assignment_type": "upgrade",
    "change_reason": "Guest requested upgrade to suite"
  }'
```

### Example 3: Checkout a guest

```bash
curl -X PATCH \
  https://api.hotel.com/api/v1/check-ins/checkin-123/checkout \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Hotel-Id: hotel-123' \
  -H 'Content-Type: application/json' \
  -d '{
    "actual_checkout_time": "2024-01-18T10:30:00Z",
    "notes": "Guest checked out on time, room in good condition"
  }'
```

---

## Integration Notes

### Frontend Integration
The frontend uses the `checkInsStore` (Zustand) to manage check-in state and API calls. See `frontend/src/store/checkInsStore.js` for implementation details.

### Webhook Events
Check-in operations trigger webhook events for external integrations:
- `check_in.created`
- `check_in.updated`
- `check_in.checked_out`
- `check_in.room_changed`

### Channel Manager Sync
Check-in operations automatically sync with connected channel managers (QloApps, Beds24) to update room availability.

---

## Changelog

### Version 1.0.0 (February 2026)
- Initial release of Check-ins API
- Support for check-in, checkout, and room change operations
- Multi-hotel support
- RBAC permissions
- Audit logging
- Room assignment history tracking




