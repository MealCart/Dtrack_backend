// src/services/postCodeValidationService.js
const { pool } = require('../config/database');

class PostCodeValidationService {
  
  // ===== HELPER: Format date to user-friendly string =====
  static formatDateFriendly(dateStr) {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString('en-AU', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch (e) {
      return null;
    }
  }

  // ===== HELPER: Get day name only =====
  static getDayName(dateStr) {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString('en-AU', { 
        weekday: 'long'
      });
    } catch (e) {
      return null;
    }
  }

  static async validatePostCode(postCode, date) {
    console.log(`🔍 Validating post code: ${postCode} for date: ${date}`);
    
    // Parse the date
    const dateObj = new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      console.error(`❌ Invalid date: ${date}`);
      return {
        isValid: false,
        region: 'unknown',
        postCode: postCode,
        suburb: 'Unknown',
        requestedDate: 'Unknown',
        requestedDay: 'Unknown',
        message: `Invalid date format. Please use YYYY-MM-DD format.`
      };
    }
    
    const dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, ...
    const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
    const dateStr = dateObj.toISOString().split('T')[0];
    
    console.log(`📅 Date: ${dateStr}, Day: ${dayName} (${dayOfWeek})`);

    // Step 1: Check if post code exists in main schedule
    const mainScheduleResult = await pool.query(
      `SELECT * FROM postcode_schedules WHERE post_code = $1`,
      [postCode]
    );

    console.log(`📊 Found ${mainScheduleResult.rows.length} records for post code ${postCode}`);

    if (mainScheduleResult.rows.length > 0) {
      const schedule = mainScheduleResult.rows[0];
      
      console.log(`📋 Schedule for ${postCode}:`, {
        suburb: schedule.suburb_town,
        mon: schedule.mon,
        tue: schedule.tue,
        wed: schedule.wed,
        thu: schedule.thu,
        fri: schedule.fri,
        sat: schedule.sat,
        sun: schedule.sun
      });
      
      // Check if the day is marked as true
      let isDeliveryDay = false;
      
      switch (dayOfWeek) {
        case 0: // Sunday
          isDeliveryDay = schedule.sun === true;
          break;
        case 1: // Monday
          isDeliveryDay = schedule.mon === true;
          break;
        case 2: // Tuesday
          isDeliveryDay = schedule.tue === true;
          break;
        case 3: // Wednesday
          isDeliveryDay = schedule.wed === true;
          break;
        case 4: // Thursday
          isDeliveryDay = schedule.thu === true;
          break;
        case 5: // Friday
          isDeliveryDay = schedule.fri === true;
          break;
        case 6: // Saturday
          isDeliveryDay = schedule.sat === true;
          break;
        default:
          isDeliveryDay = false;
      }

      console.log(`📅 ${dayName} (${dayOfWeek}) is ${isDeliveryDay ? '✅ AVAILABLE' : '❌ NOT AVAILABLE'} for ${postCode}`);

      if (isDeliveryDay) {
        return {
          isValid: true,
          region: 'weekly',
          postCode: postCode,
          suburb: schedule.suburb_town,
          run: schedule.run,
          deliveryDate: this.formatDateFriendly(dateStr),
          dayOfWeek: dayName,
          schedule: schedule,
          message: `${postCode} (${schedule.suburb_town}) is scheduled for ${dayName} deliveries.`
        };
      }

      // Find the next available day
      const nextAvailableDay = this.getNextAvailableDay(schedule, dayOfWeek);
      
      return {
        isValid: false,
        region: 'weekly',
        postCode: postCode,
        suburb: schedule.suburb_town,
        run: schedule.run,
        requestedDate: this.formatDateFriendly(dateStr),
        requestedDay: dayName,
        nextAvailableDay: nextAvailableDay,
        message: `${postCode} (${schedule.suburb_town}) does NOT deliver on ${dayName}. Next available: ${nextAvailableDay}.`
      };
    }

    // Step 2: Check if post code exists in Shepparton/Echuca region
    const sheppartonResult = await pool.query(
      `SELECT * FROM shepparton_echuca_postcodes 
       WHERE post_code = $1 AND is_active = true`,
      [postCode]
    );

    if (sheppartonResult.rows.length > 0) {
      const suburb = sheppartonResult.rows[0].suburb_town;
      console.log(`📍 Post code ${postCode} found in Shepparton/Echuca region (${suburb})`);
      
      // Check if date is in Shepparton/Echuca delivery dates
      const deliveryDateResult = await pool.query(
        `SELECT * FROM shepparton_echuca_dates 
         WHERE delivery_date = $1 AND is_active = true`,
        [dateStr]
      );

      if (deliveryDateResult.rows.length > 0) {
        return {
          isValid: true,
          region: 'fortnightly',
          postCode: postCode,
          suburb: suburb,
          run: sheppartonResult.rows[0].run,
          deliveryDate: this.formatDateFriendly(dateStr),
          dayOfWeek: dayName,
          isFortnightly: true,
          message: `${postCode} (${suburb}) is scheduled for ${this.formatDateFriendly(dateStr)} (fortnightly delivery).`
        };
      }

      // Get next available delivery date
      const nextDeliveryResult = await pool.query(
        `SELECT delivery_date, year, week_number 
         FROM shepparton_echuca_dates 
         WHERE delivery_date > $1 AND is_active = true 
         ORDER BY delivery_date 
         LIMIT 1`,
        [dateStr]
      );

      if (nextDeliveryResult.rows.length > 0) {
        const nextDate = nextDeliveryResult.rows[0].delivery_date;
        const nextDayName = this.getDayName(nextDate);
        
        return {
          isValid: false,
          region: 'fortnightly',
          postCode: postCode,
          suburb: suburb,
          run: sheppartonResult.rows[0].run,
          requestedDate: this.formatDateFriendly(dateStr),
          requestedDay: dayName,
          nextDeliveryDate: this.formatDateFriendly(nextDate),
          nextDayOfWeek: nextDayName,
          message: `${postCode} (${suburb}) is NOT scheduled for ${this.formatDateFriendly(dateStr)} (${dayName}). Next delivery: ${this.formatDateFriendly(nextDate)} (${nextDayName}).`
        };
      }

      return {
        isValid: false,
        region: 'fortnightly',
        postCode: postCode,
        suburb: suburb,
        run: sheppartonResult.rows[0].run,
        requestedDate: this.formatDateFriendly(dateStr),
        requestedDay: dayName,
        message: `No upcoming delivery dates found for ${postCode} (${suburb}).`
      };
    }

    // Step 3: Post code not found in any schedule
    console.log(`❌ Post code ${postCode} not found in any schedule`);
    return {
      isValid: false,
      region: 'unknown',
      postCode: postCode,
      suburb: 'Unknown',
      requestedDate: this.formatDateFriendly(dateStr),
      requestedDay: dayName,
      message: `Post code ${postCode} is not in our delivery service area. We do not offer delivery to this location. Please check the post code and try again.`
    };
  }

  static getNextAvailableDay(schedule, currentDayOfWeek) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 1; i <= 7; i++) {
      const nextDayIndex = (currentDayOfWeek + i) % 7;
      const dayKey = days[nextDayIndex];
      
      if (schedule[dayKey] === true) {
        return dayNames[nextDayIndex];
      }
    }
    
    return 'No available days found';
  }

  static async validateMultiplePostCodes(rows) {
    console.log(`🔍 Validating ${rows.length} post codes...`);
    const results = [];
    const errors = [];
    const warnings = [];

    for (const row of rows) {
      console.log(`\n--- Validating row ${row.rowIndex}: ${row.doNumber} ---`);
      console.log(`Post Code: ${row.postCode}, Date: ${row.date}`);
      
      try {
        const result = await this.validatePostCode(row.postCode, row.date);
        console.log(`Result for ${row.postCode}:`, {
          isValid: result.isValid,
          region: result.region,
          suburb: result.suburb,
          message: result.message
        });
        
        results.push({ ...result, rowIndex: row.rowIndex, doNumber: row.doNumber });
        
        if (!result.isValid) {
          errors.push({ ...result, rowIndex: row.rowIndex, doNumber: row.doNumber });
        }
      } catch (error) {
        console.error(`❌ Error validating row ${row.rowIndex}:`, error.message);
        errors.push({
          rowIndex: row.rowIndex,
          doNumber: row.doNumber || 'Unknown',
          postCode: row.postCode,
          suburb: 'Unknown',
          requestedDate: row.date || 'Unknown',
          requestedDay: 'Unknown',
          error: error.message,
          isValid: false,
          message: `Error validating post code ${row.postCode}: ${error.message}`
        });
      }
    }

    console.log(`\n📊 Validation Summary:`);
    console.log(`  Total: ${rows.length}`);
    console.log(`  Valid: ${results.filter(r => r.isValid).length}`);
    console.log(`  Invalid: ${results.filter(r => !r.isValid).length}`);

    return {
      results,
      errors,
      warnings,
      total: rows.length,
      valid: results.filter(r => r.isValid).length,
      invalid: results.filter(r => !r.isValid).length
    };
  }

  static async getPostCodeSchedule(postCode) {
    const mainResult = await pool.query(
      `SELECT * FROM postcode_schedules WHERE post_code = $1`,
      [postCode]
    );

    if (mainResult.rows.length > 0) {
      return {
        region: 'weekly',
        schedule: mainResult.rows[0],
        days: {
          mon: mainResult.rows[0].mon,
          tue: mainResult.rows[0].tue,
          wed: mainResult.rows[0].wed,
          thu: mainResult.rows[0].thu,
          fri: mainResult.rows[0].fri,
          sat: mainResult.rows[0].sat,
          sun: mainResult.rows[0].sun
        }
      };
    }

    const sheppartonResult = await pool.query(
      `SELECT * FROM shepparton_echuca_postcodes WHERE post_code = $1`,
      [postCode]
    );

    if (sheppartonResult.rows.length > 0) {
      const dates = await pool.query(
        `SELECT delivery_date FROM shepparton_echuca_dates 
         WHERE year = EXTRACT(YEAR FROM CURRENT_DATE) 
         AND is_active = true 
         ORDER BY delivery_date`
      );

      return {
        region: 'fortnightly',
        schedule: sheppartonResult.rows[0],
        dates: dates.rows.map(r => r.delivery_date)
      };
    }

    return null;
  }
}

module.exports = PostCodeValidationService;