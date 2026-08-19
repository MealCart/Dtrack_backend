// src/controllers/postcodeLookupController.js
const { pool } = require('../config/database');

// ============================================
// GET POSTCODE SCHEDULE
// Shows all suburbs and delivery days for a postcode
// ============================================
exports.getPostcodeSchedule = async (req, res) => {
    try {
        const { postCode } = req.params;

        // Validate postcode format
        if (!postCode || !/^\d{4}$/.test(postCode)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid postcode format. Please enter a 4-digit Australian postcode (e.g., 3000).'
            });
        }

        console.log(`🔍 Postcode Lookup: ${postCode}`);

        // ===== 1. QUERY WEEKLY SCHEDULE =====
        const weeklyQuery = `
            SELECT 
                post_code,
                suburb_town,
                region,
                run_name,
                delivery_mon,
                delivery_tue,
                delivery_wed,
                delivery_thu,
                delivery_fri,
                delivery_sat,
                delivery_sun
            FROM meal_cart_delivery
            WHERE post_code = $1
            ORDER BY suburb_town
        `;
        const weeklyResult = await pool.query(weeklyQuery, [postCode]);

        // ===== 2. QUERY FORTNIGHTLY SCHEDULE =====
        const fortnightlyQuery = `
    SELECT 
        p.post_code,
        p.suburb_town,
        p.run,
        p.delivery_day,
        (
            SELECT json_agg(
                json_build_object(
                    'delivery_date', d.delivery_date,
                    'year', d.year,
                    'week_number', d.week_number,
                    'description', d.description
                ) ORDER BY d.delivery_date
            )
            FROM fortnightly_delivery_dates d
            WHERE d.is_active = true
        ) AS delivery_dates
    FROM fortnightly_postcodes p
    WHERE p.post_code = $1
      AND p.is_active = true
    ORDER BY p.suburb_town
`;
        const fortnightlyResult = await pool.query(fortnightlyQuery, [postCode]);

        // ===== 3. CHECK IF ANY RESULTS FOUND =====
        const weeklyRows = weeklyResult.rows;
        const fortnightlyRows = fortnightlyResult.rows;

        if (weeklyRows.length === 0 && fortnightlyRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Postcode not found in our delivery schedule.',
                postCode: postCode,
                message: 'We do not currently deliver to this postcode. Please check the postcode or contact us for more information.'
            });
        }

        // ===== 4. FORMAT WEEKLY RESULTS =====
        const weeklySuburbs = weeklyRows.map(row => {
            const days = [];
            const dayMap = {
                'Monday': row.delivery_mon,
                'Tuesday': row.delivery_tue,
                'Wednesday': row.delivery_wed,
                'Thursday': row.delivery_thu,
                'Friday': row.delivery_fri,
                'Saturday': row.delivery_sat,
                'Sunday': row.delivery_sun
            };

            Object.keys(dayMap).forEach(day => {
                if (dayMap[day]) days.push(day);
            });

            return {
                suburb: row.suburb_town,
                region: row.region || 'Metro',
                run: row.run_name || 'Standard',
                scheduleType: 'weekly',
                deliveryDays: days,
                deliveryDaysShort: days.map(d => d.substring(0, 3)),
                rawSchedule: {
                    mon: row.delivery_mon,
                    tue: row.delivery_tue,
                    wed: row.delivery_wed,
                    thu: row.delivery_thu,
                    fri: row.delivery_fri,
                    sat: row.delivery_sat,
                    sun: row.delivery_sun
                }
            };
        });

        // ===== 5. FORMAT FORTNIGHTLY RESULTS =====
        const fortnightlySuburbs = fortnightlyRows.map(row => {
            const dates = row.delivery_dates || [];
            return {
                suburb: row.suburb_town,
                region: 'Shepparton-Echuca',
                run: row.run || 'Fortnightly Route',
                scheduleType: 'fortnightly',
                deliveryDays: ['Wednesday'],
                deliveryDaysShort: ['Wed'],
                deliveryDates: dates,
                nextDeliveryDate: dates.length > 0 ? dates[0].delivery_date : null,
                totalDeliveries: dates.length
            };
        });

        // ===== 6. COMBINE ALL SUBURBS =====
        const allSuburbs = [...weeklySuburbs, ...fortnightlySuburbs];

        // ===== 7. BUILD SUMMARY =====
        const allDaysSet = new Set();
        allSuburbs.forEach(s => {
            s.deliveryDays.forEach(d => allDaysSet.add(d));
        });

        const summary = {
            totalSuburbs: allSuburbs.length,
            deliveryDays: Array.from(allDaysSet).sort(),
            hasWeekly: allSuburbs.some(s => s.scheduleType === 'weekly'),
            hasFortnightly: allSuburbs.some(s => s.scheduleType === 'fortnightly'),
            weeklySuburbCount: weeklySuburbs.length,
            fortnightlySuburbCount: fortnightlySuburbs.length
        };

        // ===== 8. RESPONSE =====
        const response = {
            success: true,
            postCode: postCode,
            found: true,
            suburbs: allSuburbs,
            summary: summary,
            message: `Found ${allSuburbs.length} suburb(s) for postcode ${postCode}`
        };

        console.log(`✅ Found ${allSuburbs.length} suburbs for ${postCode}`);
        res.json(response);

    } catch (error) {
        console.error('❌ Postcode lookup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to lookup postcode',
            details: error.message
        });
    }
};

// ============================================
// SEARCH POSTCODES (Autocomplete)
// ============================================
exports.searchPostcodes = async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                data: [],
                message: 'Please enter at least 2 characters'
            });
        }

        console.log(`🔍 Searching postcodes: "${q}"`);

        // Search in weekly schedule
        const weeklyQuery = `
            SELECT DISTINCT 
                post_code,
                suburb_town,
                region,
                'weekly' AS schedule_type
            FROM meal_cart_delivery
            WHERE post_code ILIKE $1
               OR suburb_town ILIKE $2
            ORDER BY post_code
            LIMIT $3
        `;

        // Search in fortnightly schedule
        const fortnightlyQuery = `
            SELECT DISTINCT 
                post_code,
                suburb_town,
                'fortnightly' AS schedule_type
            FROM shepparton_echuca_postcodes
            WHERE post_code ILIKE $1
               OR suburb_town ILIKE $2
              AND is_active = true
            ORDER BY post_code
            LIMIT $3
        `;

        const searchPattern = `${q}%`;
        const searchPatternSuburb = `%${q}%`;
        const limitInt = parseInt(limit);

        const [weeklyResult, fortnightlyResult] = await Promise.all([
            pool.query(weeklyQuery, [searchPattern, searchPatternSuburb, limitInt]),
            pool.query(fortnightlyQuery, [searchPattern, searchPatternSuburb, limitInt])
        ]);

        // Combine and deduplicate
        const combined = [...weeklyResult.rows, ...fortnightlyResult.rows];
        const seen = new Set();
        const unique = combined.filter(item => {
            const key = `${item.post_code}-${item.suburb_town}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        res.json({
            success: true,
            data: unique,
            total: unique.length
        });

    } catch (error) {
        console.error('❌ Search postcodes error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search postcodes',
            details: error.message
        });
    }
};

// ============================================
// CHECK DELIVERY DATE
// ============================================
exports.checkDeliveryDate = async (req, res) => {
    try {
        const { postCode, date } = req.params;

        // Validate inputs
        if (!postCode || !/^\d{4}$/.test(postCode)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid postcode format. Please enter a 4-digit Australian postcode.'
            });
        }

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format. Use YYYY-MM-DD (e.g., 2026-01-14).'
            });
        }

        // Get day of week from date
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const dayMap = {
            'Monday': 'mon',
            'Tuesday': 'tue',
            'Wednesday': 'wed',
            'Thursday': 'thu',
            'Friday': 'fri',
            'Saturday': 'sat',
            'Sunday': 'sun'
        };
        const dayColumn = dayMap[dayOfWeek];

        console.log(`🔍 Checking ${postCode} on ${date} (${dayOfWeek})`);

        // ===== CHECK WEEKLY SCHEDULE =====
        const weeklyQuery = `
            SELECT 
                post_code,
                suburb_town,
                region,
                ${dayColumn} AS is_deliverable
            FROM meal_cart_delivery
            WHERE post_code = $1
            ORDER BY suburb_town
        `;
        const weeklyResult = await pool.query(weeklyQuery, [postCode]);

        if (weeklyResult.rows.length > 0) {
            const validSuburbs = [];
            const invalidSuburbs = [];

            weeklyResult.rows.forEach(row => {
                if (row.is_deliverable) {
                    validSuburbs.push(row.suburb_town);
                } else {
                    invalidSuburbs.push(row.suburb_town);
                }
            });

            // Get next available day if no deliveries today
            let nextAvailableDay = null;
            if (validSuburbs.length === 0) {
                nextAvailableDay = await getNextAvailableDay(postCode, date);
            }

            return res.json({
                success: true,
                postCode: postCode,
                date: date,
                dayOfWeek: dayOfWeek,
                scheduleType: 'weekly',
                hasDelivery: validSuburbs.length > 0,
                validSuburbs: validSuburbs,
                invalidSuburbs: invalidSuburbs,
                allSuburbs: weeklyResult.rows.map(r => r.suburb_town),
                nextAvailableDay: nextAvailableDay,
                message: validSuburbs.length > 0
                    ? `✅ Delivery available to ${validSuburbs.length} suburb(s) on ${dayOfWeek}`
                    : `❌ No delivery to this postcode on ${dayOfWeek}`
            });
        }

        // ===== CHECK FORTNIGHTLY SCHEDULE =====
        const fortnightlyCheck = await pool.query(
            `SELECT 
                p.post_code,
                p.suburb_town,
                d.delivery_date
            FROM shepparton_echuca_postcodes p
            CROSS JOIN shepparton_echuca_dates d
            WHERE p.post_code = $1
              AND p.is_active = true
              AND d.is_active = true
              AND d.delivery_date = $2
            ORDER BY p.suburb_town`,
            [postCode, date]
        );

        if (fortnightlyCheck.rows.length > 0) {
            const suburbs = [...new Set(fortnightlyCheck.rows.map(r => r.suburb_town))];
            return res.json({
                success: true,
                postCode: postCode,
                date: date,
                dayOfWeek: 'Wednesday',
                scheduleType: 'fortnightly',
                hasDelivery: true,
                validSuburbs: suburbs,
                invalidSuburbs: [],
                allSuburbs: suburbs,
                nextAvailableDay: date,
                message: `✅ Fortnightly delivery available to ${suburbs.length} suburb(s) on ${date}`
            });
        }

        // ===== CHECK IF POSTCODE EXISTS IN FORTNIGHTLY (BUT NOT ON THIS DATE) =====
        const existsFortnightly = await pool.query(
            `SELECT post_code, suburb_town
             FROM shepparton_echuca_postcodes
             WHERE post_code = $1
               AND is_active = true
             ORDER BY suburb_town`,
            [postCode]
        );

        if (existsFortnightly.rows.length > 0) {
            const nextDateResult = await pool.query(
                `SELECT delivery_date
                 FROM shepparton_echuca_dates
                 WHERE delivery_date > $1
                   AND is_active = true
                 ORDER BY delivery_date
                 LIMIT 1`,
                [date]
            );

            return res.json({
                success: true,
                postCode: postCode,
                date: date,
                dayOfWeek: 'Wednesday',
                scheduleType: 'fortnightly',
                hasDelivery: false,
                validSuburbs: [],
                invalidSuburbs: existsFortnightly.rows.map(r => r.suburb_town),
                allSuburbs: existsFortnightly.rows.map(r => r.suburb_town),
                nextAvailableDay: nextDateResult.rows.length > 0 ? nextDateResult.rows[0].delivery_date : null,
                message: `❌ No fortnightly delivery on ${date}. Next available: ${nextDateResult.rows.length > 0 ? nextDateResult.rows[0].delivery_date : 'TBD'}`
            });
        }

        // ===== NOT FOUND =====
        return res.status(404).json({
            success: false,
            error: 'Postcode not found in our delivery schedule.',
            postCode: postCode,
            message: 'We do not currently deliver to this postcode.'
        });

    } catch (error) {
        console.error('❌ Check delivery date error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check delivery date',
            details: error.message
        });
    }
};

// ============================================
// GET SUBURBS FOR A POSTCODE
// ============================================
exports.getSuburbs = async (req, res) => {
    try {
        const { postCode } = req.params;

        if (!postCode || !/^\d{4}$/.test(postCode)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid postcode format'
            });
        }

        // Get from weekly schedule
        const weeklyQuery = `
            SELECT 
                suburb_town,
                region,
                run_name,
                delivery_mon,
                delivery_tue,
                delivery_wed,
                delivery_thu,
                delivery_fri,
                delivery_sat,
                delivery_sun
            FROM meal_cart_delivery
            WHERE post_code = $1
            ORDER BY suburb_town
        `;
        const weeklyResult = await pool.query(weeklyQuery, [postCode]);

        // Get from fortnightly schedule
        const fortnightlyQuery = `
            SELECT 
                suburb_town,
                run
            FROM shepparton_echuca_postcodes
            WHERE post_code = $1
              AND is_active = true
            ORDER BY suburb_town
        `;
        const fortnightlyResult = await pool.query(fortnightlyQuery, [postCode]);

        const suburbs = [];

        // Format weekly suburbs
        weeklyResult.rows.forEach(row => {
            const days = [];
            if (row.delivery_mon) days.push('Monday');
            if (row.delivery_tue) days.push('Tuesday');
            if (row.delivery_wed) days.push('Wednesday');
            if (row.delivery_thu) days.push('Thursday');
            if (row.delivery_fri) days.push('Friday');
            if (row.delivery_sat) days.push('Saturday');
            if (row.delivery_sun) days.push('Sunday');

            suburbs.push({
                suburb: row.suburb_town,
                region: row.region || 'Metro',
                run: row.run_name || 'Standard',
                scheduleType: 'weekly',
                deliveryDays: days,
                deliveryDaysShort: days.map(d => d.substring(0, 3))
            });
        });

        // Format fortnightly suburbs
        fortnightlyResult.rows.forEach(row => {
            suburbs.push({
                suburb: row.suburb_town,
                region: 'Shepparton-Echuca',
                run: row.run || 'Fortnightly Route',
                scheduleType: 'fortnightly',
                deliveryDays: ['Wednesday'],
                deliveryDaysShort: ['Wed'],
                note: 'Fortnightly delivery on Wednesdays'
            });
        });

        if (suburbs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No suburbs found for this postcode',
                postCode: postCode,
                message: 'We do not currently deliver to this postcode.'
            });
        }

        res.json({
            success: true,
            postCode: postCode,
            suburbs: suburbs,
            total: suburbs.length
        });

    } catch (error) {
        console.error('❌ Get suburbs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suburbs',
            details: error.message
        });
    }
};

// ============================================
// HELPER: Get next available day
// ============================================
async function getNextAvailableDay(postCode, currentDate) {
    const dateObj = new Date(currentDate);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Get schedule for this postcode
    const result = await pool.query(
        `SELECT delivery_mon, delivery_tue, delivery_wed, delivery_thu, delivery_fri, delivery_sat, delivery_sun
         FROM meal_cart_delivery
         WHERE post_code = $1
         LIMIT 1`,
        [postCode]
    );

    if (result.rows.length === 0) return null;

    const schedule = result.rows[0];
    const dayMap = {
        'Monday': schedule.delivery_mon,
        'Tuesday': schedule.delivery_tue,
        'Wednesday': schedule.delivery_wed,
        'Thursday': schedule.delivery_thu,
        'Friday': schedule.delivery_fri,
        'Saturday': schedule.delivery_sat,
        'Sunday': schedule.delivery_sun
    };

    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(dateObj);
        checkDate.setDate(checkDate.getDate() + i);
        const dayName = days[checkDate.getDay()];
        if (dayMap[dayName]) {
            return dayName;
        }
    }

    return null;
}