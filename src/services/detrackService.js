// backend/src/services/detrackService.js
const axios = require('axios');
const { DETRACK_API_KEY, DETRACK_API_URL } = require('../config/constants');

class DetrackService {
  static async createJob(jobData) {
    try {
      console.log('📤 Creating job with data:', JSON.stringify(jobData, null, 2));

      // Build the data object
      const data = {
        do_number: jobData.do_number || `DO-${Date.now()}`,
        address: jobData.address || jobData.address_1 || 'Address required',
        deliver_to: jobData.deliver_to || 'Recipient required',
        date: jobData.date || new Date().toISOString().split('T')[0],
        phone: jobData.phone || '',
        notify_email: jobData.notify_email || '',
        instructions: jobData.instructions || '',
        delivery_type: jobData.delivery_type || 'Home Delivery',
        time_window: jobData.time_window || '07:00-18:00',
        cartons: parseInt(jobData.cartons) || parseInt(jobData.boxes) || 1,
        boxes: parseInt(jobData.boxes) || parseInt(jobData.cartons) || 1,
        weight: parseFloat(jobData.weight) || 0,
        address_1: jobData.address_1 || jobData.address || '',
        address_2: jobData.address_2 || '',
        postal_code: jobData.postal_code || '',
        city: jobData.city || '',
        state: jobData.state || '',
        country: jobData.country || 'Australia',
        company_name: jobData.company_name || '',
        zone: jobData.zone || '',
        pieces: parseInt(jobData.pieces) || 0,
        pallets: parseInt(jobData.pallets) || 0,
        latitude: jobData.latitude || '',
        longitude: jobData.longitude || '',
        assign_to: jobData.assign_to || '',
        run_no: jobData.run_no || '',
        depot: jobData.depot || '',
        reason: jobData.reason || '',
        received_by: jobData.received_by || '',
        note: jobData.note || '',
        remarks: jobData.remarks || '',
        carrier: jobData.carrier || '',
        payment_mode: jobData.payment_mode || '',
        payment_amount: parseFloat(jobData.payment_amount) || 0,
        invoice_no: jobData.invoice_no || '',
        account_no: jobData.account_no || '',
        delivery_sequence: parseInt(jobData.delivery_sequence) || 0,
        service_type: jobData.service_type || '',
        service_time: jobData.service_time || '',
        start_time: jobData.start_time || '',
        end_time: jobData.end_time || '',
        depot_contact: jobData.depot_contact || '',
        depot_contact_no: jobData.depot_contact_no || '',
        depot_address: jobData.depot_address || '',
        payment_collected: jobData.payment_collected || false,
        auto_reschedule: jobData.auto_reschedule || false,
        attachment_url: jobData.attachment_url || ''
      };

      // If group_id is provided, add it to the payload
      if (jobData.group_id) {
        data.group_id = jobData.group_id;
        console.log(`✅ Using group_id: ${jobData.group_id}`);
      }

      // Remove empty string fields to avoid validation errors
      const cleanData = {};
      Object.keys(data).forEach(key => {
        if (data[key] !== '' && data[key] !== null && data[key] !== undefined) {
          cleanData[key] = data[key];
        }
      });

      // Ensure required fields are always present
      const requiredFields = ['do_number', 'address', 'deliver_to'];
      requiredFields.forEach(field => {
        if (!cleanData[field]) {
          cleanData[field] = data[field] || 'Required';
        }
      });

      const payload = { data: cleanData };

      console.log('📤 Final payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(DETRACK_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });

      console.log('✅ Job created successfully');
      return response.data;

    } catch (error) {
      // Log detailed error
      console.error('❌ Detrack API Error:');
      console.error('  Status:', error.response?.status);
      console.error('  Status Text:', error.response?.statusText);

      if (error.response?.data) {
        console.error('  Response Data:', JSON.stringify(error.response.data, null, 2));

        if (error.response.data.errors) {
          console.error('  Validation Errors:', JSON.stringify(error.response.data.errors, null, 2));
        }
      }

      throw error;
    }
  }

 static async createCollectionJob(jobData) {
    try {
      console.log('📤 Creating collection with data:', JSON.stringify(jobData, null, 2));
      
      const collectFrom = jobData.collect_from || jobData.recipient_name || 'Unknown Recipient';
      console.log(`👤 Service - collect_from: ${collectFrom}`);

      // Build the data object for collection
      const data = {
        do_number: jobData.do_number || `COL-${Date.now()}`,
        address: jobData.address || jobData.address_1 || 'Address required',
        // 👇 Detrack v2 uses this field name for "Collect from"
        deliver_to_collect_from: collectFrom,
        // Keep collect_from as well for compatibility
        collect_from: collectFrom,
        date: jobData.date || new Date().toISOString().split('T')[0],
        phone: jobData.phone || '',
        notify_email: jobData.notify_email || '',
        instructions: jobData.instructions || '',
        collection_time: jobData.collection_time || '07:00-18:00',
        address_1: jobData.address_1 || jobData.address || '',
        address_2: jobData.address_2 || '',
        postal_code: jobData.postal_code || '',
        city: jobData.city || '',
        state: jobData.state || '',
        country: jobData.country || 'Australia',
        company_name: jobData.company_name || '',
        zone: jobData.zone || '',
        latitude: jobData.latitude || '',
        longitude: jobData.longitude || '',
        assign_to: jobData.assign_to || '',
        run_no: jobData.run_no || '',
        depot: jobData.depot || '',
        reason: jobData.reason || '',
        received_by: jobData.received_by || '',
        note: jobData.note || '',
        remarks: jobData.remarks || '',
        carrier: jobData.carrier || '',
        payment_mode: jobData.payment_mode || '',
        payment_amount: parseFloat(jobData.payment_amount) || 0,
        invoice_no: jobData.invoice_no || '',
        account_no: jobData.account_no || '',
        delivery_sequence: parseInt(jobData.delivery_sequence) || 0,
        service_type: 'Collection',
        service_time: jobData.service_time || '',
        start_time: jobData.start_time || '',
        end_time: jobData.end_time || '',
        depot_contact: jobData.depot_contact || '',
        depot_contact_no: jobData.depot_contact_no || '',
        depot_address: jobData.depot_address || '',
        payment_collected: jobData.payment_collected || false,
        auto_reschedule: jobData.auto_reschedule || false,
        attachment_url: jobData.attachment_url || '',
        // 👇 KEY: Set type to Collection
        type: 'Collection',
        // Items for collection
        items: jobData.items || []
      };

      // If group_id is provided, add it to the payload
      if (jobData.group_id) {
        data.group_id = jobData.group_id;
        console.log(`✅ Using group_id: ${jobData.group_id}`);
      }

      // Remove empty string fields to avoid validation errors
      const cleanData = {};
      Object.keys(data).forEach(key => {
        if (data[key] !== '' && data[key] !== null && data[key] !== undefined) {
          cleanData[key] = data[key];
        }
      });

      // Ensure required fields are always present
      const requiredFields = ['do_number', 'address', 'deliver_to_collect_from'];
      requiredFields.forEach(field => {
        if (!cleanData[field]) {
          cleanData[field] = data[field] || 'Required';
        }
      });

      const payload = { data: cleanData };

      console.log('📤 Final collection payload - deliver_to_collect_from:', payload.data.deliver_to_collect_from);
      console.log('📤 Final collection payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(DETRACK_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });

      console.log('✅ Collection created successfully');
      console.log('✅ Response - deliver_to_collect_from:', response.data?.data?.deliver_to_collect_from);
      return response.data;
      
    } catch (error) {
      console.error('❌ Detrack API Error (Collection):');
      console.error('  Status:', error.response?.status);
      console.error('  Status Text:', error.response?.statusText);
      
      if (error.response?.data) {
        console.error('  Response Data:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.data.errors) {
          console.error('  Validation Errors:', JSON.stringify(error.response.data.errors, null, 2));
        }
      }
      
      throw error;
    }
  }
  static async getJobs() {
    try {
      console.log('📡 Fetching jobs from Detrack...');
      const response = await axios.get(DETRACK_API_URL, {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });
      console.log(`✅ Fetched ${response.data?.data?.length || 0} jobs from Detrack`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching jobs:', error.message);
      throw error;
    }
  }

  static async getGroups(page = 1, limit = 10, search = '') {
    try {
      console.log(`📡 Fetching groups from Detrack (page: ${page}, limit: ${limit}, search: ${search})...`);

      let url = `https://app.detrack.com/api/v2/groups?page=${page}&limit=${limit}`;
      if (search) {
        url += `&name=${encodeURIComponent(search)}`;
      }

      const response = await axios.get(url, {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });

      console.log(`✅ Fetched ${response.data?.data?.length || 0} groups from Detrack`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching groups:', error.message);
      throw error;
    }
  }

  static async searchAllGroups(searchTerm = '') {
    try {
      console.log(`📡 Searching all groups with term: "${searchTerm}"...`);

      let allGroups = [];
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        let url = `https://app.detrack.com/api/v2/groups?page=${page}&limit=${limit}`;
        if (searchTerm) {
          url += `&name=${encodeURIComponent(searchTerm)}`;
        }

        const response = await axios.get(url, {
          headers: {
            'X-API-KEY': DETRACK_API_KEY,
            'User-Agent': 'curl/7.68.0'
          },
          timeout: 30000
        });

        const data = response.data;
        if (data.data && data.data.length > 0) {
          allGroups = allGroups.concat(data.data);
        }

        hasMore = data.links?.next !== null;
        page++;

        // Safety limit to prevent infinite loops
        if (page > 50) break;
      }

      console.log(`✅ Found ${allGroups.length} groups matching "${searchTerm}"`);
      return allGroups;
    } catch (error) {
      console.error('❌ Error searching groups:', error.message);
      throw error;
    }
  }

  static async getJobById(id) {
    try {
      console.log(`📡 Fetching job ${id} from Detrack...`);
      const response = await axios.get(`${DETRACK_API_URL}/${id}`, {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching job ${id}:`, error.message);
      throw error;
    }
  }

  static async getJobByDoNumber(doNumber) {
    try {
      console.log(`📡 Fetching job by DO number: ${doNumber} from Detrack...`);
      const response = await axios.get(`${DETRACK_API_URL}?do_number=${doNumber}`, {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });
      const jobs = response.data?.data || [];
      console.log(`✅ ${jobs.length > 0 ? 'Found' : 'No'} job found for DO number: ${doNumber}`);
      return jobs.length > 0 ? jobs[0] : null;
    } catch (error) {
      console.error(`❌ Error fetching job by DO number ${doNumber}:`, error.message);
      return null;
    }
  }

  static async getVehicles() {
    try {
      console.log('📡 Fetching vehicles from Detrack...');
      const response = await axios.get('https://app.detrack.com/api/v2/vehicles', {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });
      console.log(`✅ Fetched ${response.data?.data?.length || 0} vehicles from Detrack`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching vehicles:', error.message);
      throw error;
    }
  }
}

module.exports = DetrackService;