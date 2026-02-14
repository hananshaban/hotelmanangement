#!/bin/bash

# Test script for hotel listing functionality
# This script will test the hotel creation and listing endpoints

API_URL="http://localhost:3000/api"

echo "=== Hotel Management API Test ==="
echo ""

# Step 1: Login as SUPER_ADMIN to get token
echo "1. Logging in as SUPER_ADMIN..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
USER_ROLE=$(echo $LOGIN_RESPONSE | jq -r '.user.role')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Logged in successfully"
echo "   Role: $USER_ROLE"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Check debug endpoint
echo "2. Checking debug endpoint (all hotels in database)..."
DEBUG_RESPONSE=$(curl -s -X GET "$API_URL/v1/hotels/debug/all" \
  -H "Authorization: Bearer $TOKEN")

echo "Debug Response:"
echo $DEBUG_RESPONSE | jq '.'
echo ""

# Step 3: List hotels via normal endpoint
echo "3. Listing hotels via normal endpoint..."
HOTELS_RESPONSE=$(curl -s -X GET "$API_URL/v1/hotels" \
  -H "Authorization: Bearer $TOKEN")

HOTEL_COUNT=$(echo $HOTELS_RESPONSE | jq '. | length')
echo "✅ Found $HOTEL_COUNT hotels"
echo "Hotels:"
echo $HOTELS_RESPONSE | jq '.[] | {id, hotel_name, hotel_city}'
echo ""

# Step 4: Create a new hotel
echo "4. Creating a new test hotel..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/v1/hotels" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hotel_name": "Test Hotel API",
    "hotel_city": "Test City",
    "hotel_country": "Test Country",
    "hotel_phone": "+1234567890",
    "hotel_email": "test@testhotel.com",
    "currency": "USD",
    "timezone": "UTC"
  }')

NEW_HOTEL_ID=$(echo $CREATE_RESPONSE | jq -r '.id')

if [ "$NEW_HOTEL_ID" == "null" ] || [ -z "$NEW_HOTEL_ID" ]; then
  echo "❌ Hotel creation failed!"
  echo "Response: $CREATE_RESPONSE"
else
  echo "✅ Hotel created successfully"
  echo "   ID: $NEW_HOTEL_ID"
  echo "   Response:"
  echo $CREATE_RESPONSE | jq '.'
fi
echo ""

# Step 5: List hotels again to verify new hotel appears
echo "5. Listing hotels again to verify new hotel appears..."
HOTELS_RESPONSE_AFTER=$(curl -s -X GET "$API_URL/v1/hotels" \
  -H "Authorization: Bearer $TOKEN")

HOTEL_COUNT_AFTER=$(echo $HOTELS_RESPONSE_AFTER | jq '. | length')
echo "✅ Found $HOTEL_COUNT_AFTER hotels (was $HOTEL_COUNT before)"
echo "Hotels:"
echo $HOTELS_RESPONSE_AFTER | jq '.[] | {id, hotel_name, hotel_city}'
echo ""

# Step 6: Check if new hotel is in the list
if [ "$NEW_HOTEL_ID" != "null" ] && [ ! -z "$NEW_HOTEL_ID" ]; then
  FOUND=$(echo $HOTELS_RESPONSE_AFTER | jq --arg id "$NEW_HOTEL_ID" '.[] | select(.id == $id) | .hotel_name')
  if [ ! -z "$FOUND" ]; then
    echo "✅ SUCCESS: New hotel appears in the list!"
    echo "   Hotel: $FOUND"
  else
    echo "❌ FAILURE: New hotel NOT found in the list!"
    echo "   Expected ID: $NEW_HOTEL_ID"
  fi
fi

echo ""
echo "=== Test Complete ==="

