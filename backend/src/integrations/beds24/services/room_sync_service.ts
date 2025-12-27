import { Beds24Client } from '../beds24_client.js';
import type { Beds24Room, Beds24Booking } from '../beds24_types.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for syncing rooms between Beds24 and PMS
 */
export class RoomSyncService {
  private client: Beds24Client;

  constructor(refreshToken: string) {
    this.client = new Beds24Client(refreshToken);
  }

  /**
   * Pull rooms from Beds24
   * Tries multiple methods:
   * 1. /properties/rooms endpoint (if available)
   * 2. /properties endpoint with includeAllRooms=true
   * 3. Extract from bookings (fallback)
   */
  async pullRooms(beds24PropertyId: string): Promise<Beds24Room[]> {
    // Method 1: Try /properties/rooms endpoint
    try {
      const roomsResponse = await this.client.makeRequest<Beds24Room[]>('/properties/rooms', {
        method: 'GET',
        query: {
          propertyId: [parseInt(beds24PropertyId, 10)],
        },
      });

      // Handle "Coming soon" response or error
      if (!(roomsResponse as any).error && !(roomsResponse as any).message?.toLowerCase().includes('coming soon')) {
        // Handle both array and paginated response
        if (Array.isArray(roomsResponse) && roomsResponse.length > 0) {
          console.log(`Found ${roomsResponse.length} rooms via /properties/rooms endpoint`);
          return roomsResponse;
        }

        // If response has data property (paginated)
        if ((roomsResponse as any).data && Array.isArray((roomsResponse as any).data)) {
          const rooms = (roomsResponse as any).data;
          if (rooms.length > 0) {
            console.log(`Found ${rooms.length} rooms via /properties/rooms endpoint (paginated)`);
            return rooms;
          }
        }
      }
    } catch (error) {
      // Continue to next method
      console.log('Rooms endpoint not available, trying properties endpoint...');
    }

    // Method 2: Try /properties endpoint with includeAllRooms
    try {
      const propertiesResponse = await this.client.makeRequest<any>('/properties', {
        method: 'GET',
        query: {
          id: [parseInt(beds24PropertyId, 10)],
          includeAllRooms: true,
          includeUnitDetails: true,
        },
      });

      // Extract rooms from property response
      const properties = Array.isArray(propertiesResponse)
        ? propertiesResponse
        : (propertiesResponse as any)?.data || [];

      if (properties.length > 0) {
        const property = properties[0];
        // Property may have rooms array or units array
        const rooms: Beds24Room[] = [];

        if (property.rooms && Array.isArray(property.rooms)) {
          // Direct rooms array
          for (const room of property.rooms) {
            if (room.id) {
              rooms.push({
                id: room.id,
                propertyId: parseInt(beds24PropertyId, 10),
                name: room.name || `Room ${room.id}`,
                type: room.type,
                maxGuests: room.maxGuests || room.maxOccupancy,
                numUnits: room.numUnits || room.units?.length,
              });
            }
          }
        } else if (property.units && Array.isArray(property.units)) {
          // Extract from units
          const roomMap = new Map<number, Beds24Room>();
          for (const unit of property.units) {
            if (unit.roomId && !roomMap.has(unit.roomId)) {
              roomMap.set(unit.roomId, {
                id: unit.roomId,
                propertyId: parseInt(beds24PropertyId, 10),
                name: unit.roomName || unit.name || `Room ${unit.roomId}`,
                type: unit.roomType || unit.type,
                maxGuests: unit.maxGuests || unit.maxOccupancy,
              });
            }
          }
          rooms.push(...Array.from(roomMap.values()));
        }

        if (rooms.length > 0) {
          console.log(`Found ${rooms.length} rooms via /properties endpoint`);
          return rooms;
        }
      }
    } catch (error) {
      console.log('Properties endpoint failed, falling back to bookings extraction...');
    }

    // Method 3: Fallback - extract from bookings
    console.log('Extracting rooms from bookings...');
    return await this.extractRoomsFromBookings(beds24PropertyId);
  }

  /**
   * Extract room information from bookings (fallback when rooms endpoint unavailable)
   * Gets bookings from a wide date range to capture all rooms
   */
  private async extractRoomsFromBookings(beds24PropertyId: string): Promise<Beds24Room[]> {
    try {
      // Get bookings from a wide date range to find all rooms
      // Try last 2 years to capture all rooms
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const twoYearsFromNow = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);

      const bookings = await this.client.makeRequest<any[]>('/bookings', {
        method: 'GET',
        query: {
          propertyId: [parseInt(beds24PropertyId, 10)],
          arrivalFrom: twoYearsAgo.toISOString().split('T')[0],
          arrivalTo: twoYearsFromNow.toISOString().split('T')[0],
        },
      });

      // Extract unique room IDs from bookings
      const roomMap = new Map<number, { id: number; name?: string; type?: string; maxGuests?: number }>();
      
      const bookingsArray = Array.isArray(bookings) ? bookings : (bookings as any)?.data || [];
      
      for (const booking of bookingsArray) {
        if (booking.roomId && !roomMap.has(booking.roomId)) {
          roomMap.set(booking.roomId, {
            id: booking.roomId,
            name: booking.roomName || booking.room?.name || `Room ${booking.roomId}`,
            type: booking.roomType || booking.room?.type,
            maxGuests: booking.maxGuests || booking.room?.maxGuests,
          });
        }
      }

      console.log(`Extracted ${roomMap.size} unique rooms from bookings`);

      // Convert to Beds24Room format
      return Array.from(roomMap.values()).map((room) => {
        const beds24Room: Beds24Room = {
          id: room.id,
          propertyId: parseInt(beds24PropertyId, 10),
          name: room.name || `Room ${room.id}`,
        };
        if (room.type) {
          beds24Room.type = room.type;
        }
        if (room.maxGuests) {
          beds24Room.maxGuests = room.maxGuests;
        }
        return beds24Room;
      });
    } catch (error) {
      console.error('Failed to extract rooms from bookings:', error);
      return [];
    }
  }

  /**
   * Get unmapped Beds24 rooms (rooms that don't have a PMS mapping)
   */
  async getUnmappedBeds24Rooms(beds24PropertyId: string): Promise<Beds24Room[]> {
    const beds24Rooms = await this.pullRooms(beds24PropertyId);
    
    // Get all PMS rooms that are already mapped
    const mappedRooms = await db('rooms')
      .whereNotNull('beds24_room_id')
      .select('beds24_room_id');

    const mappedBeds24Ids = new Set(
      mappedRooms.map((r) => r.beds24_room_id?.toString())
    );

    // Filter out already mapped rooms
    return beds24Rooms.filter(
      (room) => !mappedBeds24Ids.has(room.id?.toString() || '')
    );
  }

  /**
   * Map a PMS room to a Beds24 room
   */
  async mapRoomToBeds24(
    pmsRoomId: string,
    beds24RoomId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if Beds24 room is already mapped to another PMS room
      const existingMapping = await db('rooms')
        .where({ beds24_room_id: beds24RoomId })
        .where('id', '!=', pmsRoomId)
        .first();

      if (existingMapping) {
        return {
          success: false,
          error: `Beds24 room ${beds24RoomId} is already mapped to room ${existingMapping.room_number}`,
        };
      }

      // Update PMS room with Beds24 room ID
      await db('rooms')
        .where({ id: pmsRoomId })
        .update({
          beds24_room_id: beds24RoomId,
          updated_at: new Date(),
        });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Unmap a PMS room from Beds24
   */
  async unmapRoomFromBeds24(pmsRoomId: string): Promise<void> {
    await db('rooms')
      .where({ id: pmsRoomId })
      .update({
        beds24_room_id: null,
        updated_at: new Date(),
      });
  }

  /**
   * Auto-create PMS room types from Beds24 rooms
   * Groups Beds24 rooms by type and creates room types with quantity
   */
  async autoCreateRoomsFromBeds24(
    beds24PropertyId: string,
    options: {
      roomTypeMapping?: Record<string, 'Single' | 'Double' | 'Suite'>;
      defaultPrice?: number;
      defaultFloor?: number;
    } = {}
  ): Promise<{
    created: number;
    skipped: number;
    errors: Array<{ roomId: number; error: string }>;
  }> {
    // Fetch full room details from Beds24
    const beds24Rooms = await this.pullFullRoomDetails(beds24PropertyId);
    const defaultPrice = options.defaultPrice || 100;
    const defaultFloor = options.defaultFloor || 1;

    let created = 0;
    let skipped = 0;
    const errors: Array<{ roomId: number; error: string }> = [];

    console.log(`Processing ${beds24Rooms.length} rooms from Beds24...`);

    // Group rooms by room type and similar characteristics
    const roomTypeGroups = new Map<string, any[]>();

    for (const beds24Room of beds24Rooms) {
      try {
        if (!beds24Room.id) {
          console.warn('Skipping room without ID:', beds24Room);
          continue;
        }

        // Map Beds24 roomType to PMS room_type
        const fullRoom = beds24Room as any;
        const beds24RoomType = fullRoom.roomType || beds24Room.type;
        const validBeds24RoomTypes = [
          'single', 'double', 'twin', 'twinDouble', 'triple', 'quadruple',
          'apartment', 'family', 'suite', 'studio', 'dormitoryRoom', 'bedInDormitory',
          'bungalow', 'chalet', 'holidayHome', 'villa', 'mobileHome', 'tent',
          'campSite', 'activity', 'tour', 'carRental'
        ];
        
        const roomType: string = beds24RoomType && typeof beds24RoomType === 'string' && validBeds24RoomTypes.includes(beds24RoomType.toLowerCase())
          ? beds24RoomType.toLowerCase()
          : 'double';

        // Group key: room_type + price_group (rounded to nearest 10) + floor
        const pricePerNight = fullRoom.rackRate || fullRoom.minPrice || defaultPrice;
        const priceGroup = Math.round(parseFloat(pricePerNight) / 10) * 10;
        const floor = fullRoom.floor || defaultFloor;
        const groupKey = `${roomType}_${priceGroup}_${floor}`;

        if (!roomTypeGroups.has(groupKey)) {
          roomTypeGroups.set(groupKey, []);
        }
        roomTypeGroups.get(groupKey)!.push(beds24Room);
      } catch (error) {
        errors.push({
          roomId: beds24Room.id || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Create room types from groups
    console.log(`Creating ${roomTypeGroups.size} room types from ${beds24Rooms.length} Beds24 rooms...`);

    for (const [groupKey, rooms] of roomTypeGroups) {
      try {
        const parts = groupKey.split('_');
        const roomType: string = parts[0] || 'double';
        const priceGroup = parts[1] || '0';
        const floor = parts[2] || String(defaultFloor);
        const firstRoom = rooms[0] as any;
        const fullRoom = firstRoom as any;

        // Calculate aggregate values
        // Sum numUnits from all rooms (Beds24 rooms can have multiple units)
        // If numUnits is not available, count each room as 1 unit
        const qty = rooms.reduce((sum, r: any) => {
          const numUnits = r.numUnits || r.num_units || (r.units && Array.isArray(r.units) ? r.units.length : 1);
          return sum + (parseInt(String(numUnits)) || 1);
        }, 0);
        
        const avgPrice = rooms.reduce((sum, r: any) => {
          const price = (r as any).rackRate || (r as any).minPrice || (r as any).price_per_night || defaultPrice;
          return sum + parseFloat(String(price));
        }, 0) / rooms.length;
        const finalPrice = Math.round(avgPrice * 100) / 100;
        const finalFloor = parseInt(String(floor)) || defaultFloor;

        // Check if room type already exists (by room_type, price, and floor)
        // This is better than checking beds24_room_id since we group multiple rooms
        const existingRoomType = await db('room_types')
          .where({ room_type: roomType })
          .where('price_per_night', '>=', finalPrice - 1)
          .where('price_per_night', '<=', finalPrice + 1)
          .where('floor', finalFloor)
          .whereNull('deleted_at')
          .first();

        if (existingRoomType) {
          // Update existing room type with new quantity from Beds24
          // Use the calculated qty from Beds24 (which sums numUnits) as the source of truth
          if (qty !== existingRoomType.qty) {
            console.log(`Updating room type ${existingRoomType.name}: qty ${existingRoomType.qty} -> ${qty} (from Beds24)`);
            await db('room_types')
              .where({ id: existingRoomType.id })
              .update({ 
                qty: qty, 
                updated_at: new Date(),
                // Also update other fields that might have changed in Beds24
                price_per_night: finalPrice,
                max_people: fullRoom.maxPeople || firstRoom.maxGuests || existingRoomType.max_people,
              });
          }
          console.log(`Room type ${existingRoomType.name} already exists (qty: ${qty}), skipping`);
          skipped += rooms.length;
          continue;
        }

        // Aggregate features from all rooms
        const allFeatures = new Set<string>();
        for (const room of rooms) {
          const features = (room as any).features || [];
          if (Array.isArray(features)) {
            features.forEach((f: string) => {
              if (f && typeof f === 'string') {
                allFeatures.add(f);
              }
            });
          }
        }

        // Aggregate units from all rooms
        const allUnits: any[] = [];
        for (const room of rooms) {
          const units = (room as any).units || [];
          if (Array.isArray(units) && units.length > 0) {
            allUnits.push(...units);
          } else {
            // If no units array but numUnits exists, create unit entries
            const numUnits = room.numUnits || room.num_units || 1;
            for (let i = 0; i < numUnits; i++) {
              allUnits.push({
                id: room.id ? `${room.id}-${i + 1}` : undefined,
                name: `${room.name || 'Unit'} ${i + 1}`,
              });
            }
          }
        }

        // Create room type
        const roomTypeCapitalized = roomType.charAt(0).toUpperCase() + roomType.slice(1);
        const roomTypeName = firstRoom.name || `${roomTypeCapitalized} Room`;
        
        // Prepare features and units as JSON strings for JSONB columns
        const featuresArray = Array.from(allFeatures);
        const featuresJson = JSON.stringify(featuresArray);
        const unitsJson = JSON.stringify(allUnits);
        
        const roomTypeData = {
          name: roomTypeName,
          room_type: roomType,
          qty: qty,
          price_per_night: finalPrice,
          min_price: Math.round(finalPrice * 0.9 * 100) / 100,
          max_price: Math.round(finalPrice * 1.1 * 100) / 100,
          rack_rate: finalPrice,
          cleaning_fee: parseFloat(String(fullRoom.cleaningFee || fullRoom.cleaning_fee || '0')),
          security_deposit: parseFloat(String(fullRoom.securityDeposit || fullRoom.security_deposit || '0')),
          max_people: fullRoom.maxPeople || fullRoom.max_people || firstRoom.maxGuests || firstRoom.max_guests || null,
          max_adult: fullRoom.maxAdult || fullRoom.max_adult || null,
          max_children: fullRoom.maxChildren || fullRoom.max_children || null,
          min_stay: fullRoom.minStay || fullRoom.min_stay || null,
          max_stay: fullRoom.maxStay || fullRoom.max_stay || null,
          tax_percentage: fullRoom.taxPercentage || fullRoom.tax_percentage || null,
          tax_per_person: fullRoom.taxPerson || fullRoom.tax_per_person || null,
          room_size: fullRoom.roomSize || fullRoom.room_size || null,
          floor: finalFloor,
          highlight_color: fullRoom.highlightColor || null,
          sell_priority: fullRoom.sellPriority ? parseInt(String(fullRoom.sellPriority)) : null,
          include_reports: fullRoom.includeReports !== undefined ? Boolean(fullRoom.includeReports) : true,
          restriction_strategy: fullRoom.restrictionStrategy || null,
          overbooking_protection: fullRoom.overbookingProtection || null,
          block_after_checkout_days: parseInt(String(fullRoom.blockAfterCheckOutDays || '0')),
          control_priority: fullRoom.controlPriority ? parseInt(String(fullRoom.controlPriority)) : null,
          unit_allocation: fullRoom.unitAllocation || fullRoom.unit_allocation || 'perBooking',
          features: db.raw('?::jsonb', [featuresJson]), // Use raw SQL for JSONB
          description: firstRoom.description || fullRoom.description || null,
          units: db.raw('?::jsonb', [unitsJson]), // Use raw SQL for JSONB
          beds24_room_id: firstRoom.id.toString(), // Store first room's ID as reference
          // Store all Beds24 room IDs in description or a separate field for tracking
          // Note: For now, we store the first room's ID. In the future, consider a mapping table.
        };

        console.log(`Creating room type: ${roomTypeName} (${qty} units from ${rooms.length} Beds24 room(s), Beds24 ID: ${firstRoom.id})`);
        console.log(`  - Price: $${finalPrice}/night`);
        console.log(`  - Floor: ${finalFloor}`);
        console.log(`  - Max People: ${roomTypeData.max_people || 'N/A'}`);
        console.log(`  - Features: ${featuresArray.length} feature(s)`);
        console.log(`  - Units: ${allUnits.length} unit(s) defined`);
        await db('room_types').insert(roomTypeData);

        created++;
        console.log(`Successfully created room type ${created}/${roomTypeGroups.size}`);
      } catch (error) {
        console.error(`Error creating room type for group ${groupKey}:`, error);
        errors.push({
          roomId: rooms[0]?.id || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { created, skipped, errors };
  }

  /**
   * Pull full room details from Beds24 (with all Phase 1/2 fields)
   */
  private async pullFullRoomDetails(beds24PropertyId: string): Promise<any[]> {
    try {
      // Try to get full room details from /properties endpoint
      const propertiesResponse = await this.client.makeRequest<any>('/properties', {
        method: 'GET',
        query: {
          id: [parseInt(beds24PropertyId, 10)],
          includeAllRooms: true,
          includeUnitDetails: true,
        },
      });

      const properties = Array.isArray(propertiesResponse)
        ? propertiesResponse
        : (propertiesResponse as any)?.data || [];

      console.log('Properties response structure:', JSON.stringify(properties, null, 2).substring(0, 500));

      if (properties.length > 0) {
        const property = properties[0];
        
        // Try different response structures
        if (property.roomTypes && Array.isArray(property.roomTypes)) {
          console.log(`Found ${property.roomTypes.length} roomTypes in property`);
          return property.roomTypes;
        }
        
        if (property.rooms && Array.isArray(property.rooms)) {
          console.log(`Found ${property.rooms.length} rooms in property`);
          return property.rooms;
        }
        
        // If property has units, extract unique rooms from units
        if (property.units && Array.isArray(property.units)) {
          console.log(`Found ${property.units.length} units in property, extracting rooms...`);
          const roomMap = new Map<number, any>();
          for (const unit of property.units) {
            if (unit.roomId && !roomMap.has(unit.roomId)) {
              roomMap.set(unit.roomId, {
                id: unit.roomId,
                name: unit.roomName || unit.name || `Room ${unit.roomId}`,
                type: unit.roomType || unit.type,
                roomType: unit.roomType || unit.type,
                maxGuests: unit.maxGuests || unit.maxOccupancy,
                ...unit, // Include all unit properties
              });
            }
          }
          const rooms = Array.from(roomMap.values());
          console.log(`Extracted ${rooms.length} unique rooms from units`);
          return rooms;
        }
      }

      console.log('No rooms found in properties response, falling back to pullRooms...');
      // Fallback to basic room list
      const basicRooms = await this.pullRooms(beds24PropertyId);
      console.log(`Fallback returned ${basicRooms.length} rooms`);
      return basicRooms;
    } catch (error) {
      console.error('Failed to fetch full room details, using basic room list:', error);
      // Fallback to basic room list
      const basicRooms = await this.pullRooms(beds24PropertyId);
      console.log(`Error fallback returned ${basicRooms.length} rooms`);
      return basicRooms;
    }
  }

  /**
   * Load Beds24 configuration
   */
  private async loadBeds24Config() {
    const propertyId = '00000000-0000-0000-0000-000000000001';
    const config = await db('beds24_config')
      .where({ property_id: propertyId })
      .first();

    if (!config) {
      return null;
    }

    const refreshToken = decrypt(config.refresh_token);
    this.client.setRefreshToken(refreshToken);

    return {
      ...config,
      refresh_token: refreshToken,
    };
  }
}

