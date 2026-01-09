# QloApps Configuration API Reference

## Quick Start

To configure QloApps for the first time:

1. Send a POST request to save the configuration
2. Click "Test Connection" to verify it works
3. The system will start syncing

## API Endpoints

### 1. Setup Configuration

**Endpoint:** `POST /api/v1/settings/channel-manager/setup-qloapps`

**Headers:**
```
Authorization: Bearer <your_auth_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "baseUrl": "https://hotel.qloapps.com",
  "apiKey": "your-webservice-api-key",
  "qloAppsHotelId": 123,
  "syncInterval": 15
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "QloApps configuration saved successfully"
}
```

**Error Responses:**

400 - Missing required fields:
```json
{
  "success": false,
  "error": "baseUrl, apiKey, and qloAppsHotelId are required"
}
```

400 - Invalid URL format:
```json
{
  "success": false,
  "error": "Invalid baseUrl format"
}
```

400 - Invalid hotel ID:
```json
{
  "success": false,
  "error": "qloAppsHotelId must be a positive number"
}
```

500 - Server error:
```json
{
  "success": false,
  "error": "Error message from server"
}
```

---

### 2. Get Configuration Status

**Endpoint:** `GET /api/v1/settings/channel-manager`

**Headers:**
```
Authorization: Bearer <your_auth_token>
```

**Response:**
```json
{
  "active": "qloapps",
  "available": ["beds24", "qloapps"],
  "beds24": {
    "configured": true,
    "syncEnabled": false
  },
  "qloapps": {
    "configured": true,
    "syncEnabled": true
  }
}
```

---

### 3. Test Connection

**Endpoint:** `POST /api/v1/settings/channel-manager/test-qloapps`

**Headers:**
```
Authorization: Bearer <your_auth_token>
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Connection test successful",
  "latency": 245
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "QloApps is not configured"
}
```

---

### 4. Switch Active Channel Manager

**Endpoint:** `POST /api/v1/settings/channel-manager/switch`

**Headers:**
```
Authorization: Bearer <your_auth_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "channelManager": "qloapps"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Switched to qloapps",
  "status": {
    "active": "qloapps",
    "available": ["beds24", "qloapps"],
    "beds24": { "configured": true, "syncEnabled": false },
    "qloapps": { "configured": true, "syncEnabled": true }
  }
}
```

---

## Configuration Parameters

### baseUrl
- **Type:** String (URL)
- **Required:** Yes
- **Format:** Must be valid HTTPS URL
- **Example:** `https://hotel.qloapps.com`
- **Validation:** Checked by `new URL()` constructor
- **Note:** Do not include trailing slash

### apiKey
- **Type:** String
- **Required:** Yes
- **Format:** WebService API key from QloApps
- **Storage:** Encrypted before saving to database
- **Note:** Never shown in plain text after save

### qloAppsHotelId
- **Type:** Integer
- **Required:** Yes
- **Format:** Positive integer
- **Range:** Must be > 0
- **Source:** `id_hotel` from QloApps database
- **Example:** `123`

### syncInterval
- **Type:** Integer (minutes)
- **Required:** No
- **Default:** 15
- **Allowed Values:** 5, 10, 15, 30, 60
- **Range:** 1-1440 (1 day)
- **Purpose:** How often background sync runs

---

## cURL Examples

### Setup Configuration
```bash
curl -X POST http://localhost:5000/api/v1/settings/channel-manager/setup-qloapps \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://hotel.qloapps.com",
    "apiKey": "your-api-key-here",
    "qloAppsHotelId": 123,
    "syncInterval": 15
  }'
```

### Get Status
```bash
curl http://localhost:5000/api/v1/settings/channel-manager \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Connection
```bash
curl -X POST http://localhost:5000/api/v1/settings/channel-manager/test-qloapps \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Switch to QloApps
```bash
curl -X POST http://localhost:5000/api/v1/settings/channel-manager/switch \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channelManager": "qloapps"}'
```

---

## JavaScript/Fetch Examples

### Setup Configuration
```javascript
const response = await fetch('/api/v1/settings/channel-manager/setup-qloapps', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    baseUrl: 'https://hotel.qloapps.com',
    apiKey: 'your-api-key',
    qloAppsHotelId: 123,
    syncInterval: 15
  })
})

const data = await response.json()
if (response.ok) {
  console.log('Configuration saved:', data.message)
} else {
  console.error('Error:', data.error)
}
```

### Test Connection
```javascript
const response = await fetch('/api/v1/settings/channel-manager/test-qloapps', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

const data = await response.json()
if (data.success) {
  console.log('Connection successful, latency:', data.latency, 'ms')
} else {
  console.error('Connection failed:', data.message)
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid baseUrl format" | URL without protocol or malformed | Use full URL: `https://hotel.qloapps.com` |
| "qloAppsHotelId must be a positive number" | Hotel ID is 0, negative, or not a number | Use valid positive integer from QloApps |
| "baseUrl, apiKey, and qloAppsHotelId are required" | Missing required field | Provide all three required fields |
| "QloApps is not configured" | Configuration not saved | Run setup endpoint first |
| 401 Unauthorized | Invalid or missing auth token | Check authorization header |
| 403 Forbidden | User role is not ADMIN or SUPER_ADMIN | Use admin account |

---

## Database Schema

Configuration is stored in `qloapps_config` table:

```sql
CREATE TABLE qloapps_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES hotel_settings(id),
  base_url VARCHAR(500) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  qloapps_hotel_id INTEGER NOT NULL,
  sync_interval_minutes INTEGER DEFAULT 15,
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_reservations_inbound BOOLEAN DEFAULT TRUE,
  sync_reservations_outbound BOOLEAN DEFAULT TRUE,
  sync_availability BOOLEAN DEFAULT TRUE,
  sync_rates BOOLEAN DEFAULT TRUE,
  last_successful_sync TIMESTAMP,
  last_sync_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  circuit_state VARCHAR(20) DEFAULT 'closed',
  circuit_opened_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Key Points:**
- Single config per property (enforced by unique `property_id`)
- API key stored encrypted in `api_key_encrypted` column
- Sync flags allow granular control
- Circuit breaker pattern for fault tolerance

---

## Security Notes

1. **Authentication Required**
   - All endpoints require valid JWT token in Authorization header
   - Only ADMIN and SUPER_ADMIN roles can configure

2. **API Key Encryption**
   - Keys encrypted using AES-256-CBC (configurable)
   - Encryption key stored in environment variable
   - Never logged or displayed in plain text

3. **Input Validation**
   - All inputs validated on server-side
   - URL format checked using Node.js URL constructor
   - SQL injection prevented by parameterized queries

4. **Error Messages**
   - No sensitive information in error responses
   - Errors describe what went wrong without exposing internals

---

## Integration with Frontend

The frontend Settings page has a UI that calls these endpoints:

1. **Channel Manager Tab** → Shows configuration status
2. **Setup Connection Button** → Opens form to call setup endpoint
3. **Edit Connection Button** → Allows updating configuration
4. **Test Connection Button** → Calls test endpoint
5. **Save Configuration** → Calls setup endpoint with form data

All UI state and error handling is managed in `SettingsPage.jsx`.

---

## Troubleshooting

### Configuration Won't Save
- Check if user has ADMIN or SUPER_ADMIN role
- Verify all required fields are provided
- Check network connection to backend
- Look for error message in response

### Test Connection Fails
- Verify baseUrl is correct and accessible
- Check API key is correct
- Ensure QloApps hotel ID matches your hotel
- Check QloApps instance is running

### Can't Access Setup Endpoint
- Verify authentication token is valid
- Check user role (must be ADMIN or SUPER_ADMIN)
- Ensure endpoint path is correct: `/api/v1/settings/channel-manager/setup-qloapps`

---

## Version History

- **v1.0** - Initial implementation
  - Setup configuration endpoint
  - Validation and encryption
  - Frontend UI integration
