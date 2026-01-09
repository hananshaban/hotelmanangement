# What You Can Do Now

## 🎯 The Feature

You can now **configure QloApps from the Settings page** without manually editing the database.

## 📍 Where to Find It

**Settings Page → Channel Manager Tab**

## 🖱️ What You'll See

### If QloApps is NOT configured:

```
┌─────────────────────────────────────────────────────┐
│  ⚪ QloApps              Not Configured              │
│                                                      │
│  [Setup Connection]  [Test Connection]             │
│                                                      │
│  ℹ️ QloApps is not currently configured...          │
│     Click "Setup Connection" to configure.          │
└─────────────────────────────────────────────────────┘
```

### What Happens When You Click "Setup Connection":

A form appears:

```
┌─────────────────────────────────────────────────┐
│ Setup QloApps Connection                        │
│                                                 │
│ QloApps Base URL *                             │
│ [_________________________________] (text)    │
│                                                 │
│ QloApps Hotel ID *                             │
│ [_______________] (number)                     │
│                                                 │
│ WebService API Key *                           │
│ [_________________________________] (masked)  │
│                                                 │
│ Sync Interval (minutes)                        │
│ [15 minutes                    ▼]              │
│                                                 │
│ [Save Configuration]  [Cancel]                 │
└─────────────────────────────────────────────────┘
```

## 📝 What to Fill In

1. **Base URL** - Your QloApps instance URL
   - Example: `https://hotel.qloapps.com`
   - Make sure it starts with `https://`

2. **Hotel ID** - The hotel ID from QloApps
   - Example: `1` or `123`
   - Must be a number

3. **API Key** - Your WebService API key
   - Example: `abc123def456`
   - Will be encrypted and never shown in plain text

4. **Sync Interval** - How often to sync (minutes)
   - Options: 5, 10, 15, 30, or 60 minutes
   - Default: 15 minutes

## ✅ After You Save

### Success:

```
✓ Form closes
✓ Status changes to "✓ Connected" (green)
✓ Toast notification: "Configuration saved successfully"
✓ Buttons change:
  - "Setup Connection" → "Edit Connection"
  - Can now click "Test Connection"
```

### New State After Configuration:

```
┌─────────────────────────────────────────────────────┐
│  🟢 QloApps              ✓ Connected                │
│                                                      │
│  [Edit Connection]  [Test Connection]              │
│                                                      │
│  ✓ Sync Features:                                  │
│    ✓ Automatic reservation sync                    │
│    ✓ Room availability updates                     │
│    ✓ Rate synchronization                          │
│    ✓ Room type mapping                             │
└─────────────────────────────────────────────────────┘
```

## 🧪 How to Test Connection

After saving configuration:

1. Click "Test Connection" button
2. You'll see a spinner while it tests
3. If successful: Green toast "✓ Connection successful!"
4. If it fails: Red toast with error details

## ✏️ How to Edit Configuration

After configuration is saved:

1. Click "Edit Connection" button
2. Form appears with current values
3. Modify any field (API key field will be empty)
4. Click "Save Configuration"
5. Changes are saved immediately

## 🔐 Security Features

✓ **API Key is Encrypted**
  - Not stored as plain text
  - Masked in form with dots (•••)
  - Only decrypted when needed

✓ **Admin Only**
  - Only ADMIN and SUPER_ADMIN can configure
  - Other users cannot see the form

✓ **Input Validation**
  - All fields are validated
  - Invalid entries show error messages
  - Form won't submit until valid

## ❌ What Happens on Error

If something goes wrong:

```
┌─────────────────────────────────┐
│ ✗ Invalid baseUrl format        │
│                                 │
│ [https://invalid url     ]      │
│                                 │
│ [Save Configuration] [Cancel]   │
└─────────────────────────────────┘

Toast also appears:
✗ Error: Invalid baseUrl format
```

You can:
1. See the error message
2. Fix the problem
3. Try saving again
4. Form stays open to retry

## 🎯 Use Cases

### First-Time Setup
1. Click "Setup Connection"
2. Enter QloApps credentials
3. Click "Save Configuration"
4. Done! System is now configured

### Update Credentials
1. Click "Edit Connection"
2. Enter new credentials
3. Click "Save Configuration"
4. Done! New credentials are saved

### Verify Connection Works
1. Click "Test Connection"
2. See if connection is successful
3. If fails, go back and "Edit Connection"

### Change Sync Frequency
1. Click "Edit Connection"
2. Change "Sync Interval" dropdown
3. Click "Save Configuration"
4. New frequency takes effect

## 💾 Where is Data Stored?

- Configuration saved in PostgreSQL database
- Table: `qloapps_config`
- API key is encrypted in the database
- Only database and admin users can see it

## 🚀 What Happens After Configuration?

Once configured:
- ✓ QloApps status shows as "✓ Connected"
- ✓ System starts regular sync operations
- ✓ New reservations are synchronized
- ✓ Availability updates are pushed
- ✓ Rates are synchronized

## 📱 Mobile Friendly

The form works on:
- ✓ Desktop browsers
- ✓ Tablet browsers
- ✓ Mobile phones
- ✓ All responsive screen sizes

## 🎨 Visual Indicators

**Status Colors:**
- Gray (⚪) = Not Configured
- Green (🟢) = Configured & Connected
- Red (✗) = Error state

**Button Colors:**
- Blue = Main action (Setup/Save)
- Gray = Secondary action (Edit)
- Purple = Special action (Test)

**Toasts:**
- Green ✓ = Success
- Red ✗ = Error

## 📊 What Gets Stored

When you save, the database gets:
```sql
INSERT INTO qloapps_config VALUES:
  - base_url: "https://hotel.qloapps.com"
  - api_key_encrypted: "[encrypted key]"
  - qloapps_hotel_id: 1
  - sync_interval_minutes: 15
  - sync_enabled: true
  - ... (other sync settings)
```

## ❓ Common Questions

**Q: Is my API key safe?**
A: Yes! It's encrypted in the database and only decrypted when needed.

**Q: Can I change the configuration later?**
A: Yes! Click "Edit Connection" anytime.

**Q: What if I enter wrong credentials?**
A: Configuration is saved but test will fail. Edit and try again.

**Q: Who can see the configuration?**
A: Only database admins and ADMIN/SUPER_ADMIN users.

**Q: What does "Sync Interval" mean?**
A: How often (in minutes) the system checks QloApps for new/updated reservations.

**Q: Will existing data be synced?**
A: Depends on sync configuration. New data after setup will definitely sync.

## 🎉 Summary

You now have a user-friendly way to:
✓ Configure QloApps without touching database
✓ Save credentials securely (encrypted)
✓ Test connection to verify it works
✓ Edit configuration anytime
✓ Control sync frequency
✓ See clear status indicators

Everything is accessible from the Settings page in the Channel Manager tab!

---

## Next Steps

1. **Test It Out**
   - Go to Settings → Channel Manager
   - Click "Setup Connection"
   - Enter your QloApps details
   - Click "Save"

2. **Verify It Works**
   - Click "Test Connection"
   - See if it connects successfully

3. **Monitor Sync**
   - Watch for reservations syncing
   - Check availability updates
   - Verify rates are pushing

4. **Troubleshoot if Needed**
   - Edit connection if credentials wrong
   - Click "Test Connection" to verify
   - Check logs if sync not working

---

**You're ready to go! 🚀**

The QloApps configuration system is complete and ready to use!
