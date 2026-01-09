# Quick Start: QloApps Configuration Setup

## ✅ What Was Implemented

A complete configuration setup system for QloApps integration including:
- Backend API endpoint to save configuration
- Frontend form in Settings page
- Database storage with encrypted API keys
- Form validation and error handling
- Access control (admin only)

## 🚀 How to Use It

### For End Users (Hotel Admin)

1. **Open Settings**
   - Go to `http://localhost:3000/settings`
   - Click "Channel Manager" tab

2. **Configure QloApps**
   - Click "Setup Connection" button
   - Fill in the form:
     - QloApps Base URL
     - Hotel ID
     - API Key
     - Sync Interval (optional)
   - Click "Save Configuration"

3. **Test Connection**
   - Click "Test Connection" button
   - Verify it connects successfully

4. **Edit Configuration** (if needed)
   - Click "Edit Connection" button
   - Update any field
   - Click "Save Configuration"

### For Developers (Testing)

**Start the application:**
```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev

# Terminal 2: Frontend
cd frontend
npm install
npm start
```

**Test the configuration:**
```bash
# Using cURL to setup configuration
curl -X POST http://localhost:5000/api/v1/settings/channel-manager/setup-qloapps \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://hotel.qloapps.com",
    "apiKey": "test-key-123",
    "qloAppsHotelId": 1,
    "syncInterval": 15
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "QloApps configuration saved successfully"
}
```

## 📋 Files Changed

| File | Changes |
|------|---------|
| `backend/src/services/settings/channel_manager_controller.ts` | Added setup handler |
| `backend/src/services/settings/settings_routes.ts` | Added route |
| `frontend/src/pages/SettingsPage.jsx` | Added form and UI |

## 🧪 Testing Checklist

- [ ] Backend runs without errors
- [ ] Frontend loads without errors
- [ ] Can see "Setup Connection" button
- [ ] Form appears when clicked
- [ ] Form validates required fields
- [ ] Can save valid configuration
- [ ] Configuration saved to database
- [ ] Status updates to "✓ Connected"
- [ ] Can edit configuration
- [ ] Test connection button works
- [ ] Error messages display correctly

## 📚 Documentation

For more details, see:
- `docs/QLOAPPS_SETUP_CONFIGURATION.md` - User guide
- `backend/API_QLOAPPS_CONFIG.md` - API reference
- `docs/TESTING_QLOAPPS_CONFIG.md` - Testing guide
- `docs/QLOAPPS_CONFIG_UI_GUIDE.md` - UI visual guide
- `docs/QLOAPPS_CONFIGURATION_IMPLEMENTATION.md` - Technical details
- `IMPLEMENTATION_SUMMARY_QLOAPPS_CONFIG.md` - Summary

## ❓ Common Questions

### Q: Where is the configuration stored?
A: In the `qloapps_config` table in PostgreSQL. API key is encrypted before storage.

### Q: Who can configure QloApps?
A: Only users with ADMIN or SUPER_ADMIN role.

### Q: Is the API key secure?
A: Yes, it's encrypted using AES-256-CBC before being stored in the database.

### Q: Can I edit the configuration after saving?
A: Yes, click "Edit Connection" button to modify it.

### Q: What happens if I enter wrong credentials?
A: The configuration will be saved but test connection will fail. You can edit and try again.

### Q: What is the Sync Interval for?
A: It determines how often the system checks QloApps for new/updated reservations (in minutes).

## 🔧 Configuration Fields Explained

| Field | What is it? | Example |
|-------|-----------|---------|
| Base URL | Your QloApps instance URL | `https://hotel.qloapps.com` |
| Hotel ID | The hotel ID from QloApps database | `1` or `123` |
| API Key | WebService API key for authentication | `abc123def456ghi789` |
| Sync Interval | How often to check for changes (minutes) | `15` (default) |

## 🔐 Security Notes

✓ API keys are encrypted before storage
✓ Only admins can configure
✓ All inputs validated on server
✓ HTTPS recommended for production
✓ No sensitive data in error messages

## 🐛 Troubleshooting

**"Setup Connection button not showing"**
- Refresh the page
- Check browser console for errors

**"Configuration won't save"**
- Fill all required fields
- Check you're logged in as admin
- Look for error message in the form

**"Test connection fails"**
- Verify credentials are correct
- Check QloApps instance is accessible
- Ensure API key has WebService permission

**"API key looks wrong in database"**
- That's correct! It's encrypted
- The system will decrypt it when needed

## 🎯 What's Next?

After successful configuration:

1. ✓ Configuration is saved
2. → System is ready to sync
3. → Test connection to verify
4. → Monitor sync operations
5. → Check reservations are syncing

## 📞 Support

If you encounter issues:

1. Check the documentation files
2. Review the testing guide
3. Check browser console for client errors
4. Check backend logs for server errors
5. Query database to verify data saved

## 🎉 You're All Set!

The QloApps configuration setup is ready to use. Simply:
1. Start backend and frontend
2. Go to Settings → Channel Manager
3. Click "Setup Connection"
4. Fill in your QloApps details
5. Click "Save Configuration"

That's it! Configuration is saved and you can now test the connection.

---

## API Endpoints Summary

### Setup Configuration
```
POST /api/v1/settings/channel-manager/setup-qloapps
```

### Get Status
```
GET /api/v1/settings/channel-manager
```

### Test Connection
```
POST /api/v1/settings/channel-manager/test-qloapps
```

### Switch Channel Manager
```
POST /api/v1/settings/channel-manager/switch
```

All endpoints require authentication (Bearer token).

---

## Next Features to Implement

After configuration setup is working:

- [ ] Room type mapping UI
- [ ] Reservation sync status
- [ ] Availability sync controls
- [ ] Rate sync controls
- [ ] Sync history/logs
- [ ] Error recovery
- [ ] Manual sync trigger

---

**Happy integrating! 🚀**
