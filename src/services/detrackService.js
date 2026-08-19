// backend/src/services/detrackService.js
const axios = require('axios');
const { DETRACK_API_KEY, DETRACK_API_URL, DETRACK_DN_API_URL } = require('../config/constants');

class DetrackService {
  static async createJob(jobData) {
    try {
      console.log('📤 Creating job with data:', JSON.stringify(jobData, null, 2));

      const numberOfLabels = parseInt(jobData.boxes) || parseInt(jobData.cartons) || parseInt(jobData.number_of_shipping_labels) || 1;

      // 👇 CRITICAL FIX: Use deliver_to_collect_from
      const data = {
        do_number: jobData.do_number || `DO-${Date.now()}`,
        address: jobData.address || jobData.address_1 || 'Address required',
        deliver_to_collect_from: jobData.deliver_to || jobData.deliver_to_collect_from || jobData.recipient_name || 'Recipient required',
        date: jobData.date || new Date().toISOString().split('T')[0],
        phone: jobData.phone || '',
        notify_email: jobData.notify_email || '',
        instructions: jobData.instructions || '',
        delivery_type: jobData.delivery_type || 'Home Delivery',
        time_window: jobData.time_window || '07:00-18:00',
        number_of_shipping_labels: numberOfLabels,
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
        // 👇 CRITICAL FIX: Always include deliver_to_collect_from
        if (key === 'deliver_to_collect_from') {
          cleanData[key] = data[key] || 'Recipient required';
        } else if (data[key] !== '' && data[key] !== null && data[key] !== undefined) {
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

      console.log('📤 Final payload deliver_to_collect_from:', payload.data.deliver_to_collect_from);
      console.log('📤 Final payload:', JSON.stringify(payload, null, 2));

      // ✅ CREATE: Use /api/v2/jobs for POST (not /dn/)
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
        
        // 👇 For collections, this is the SENDER name (who you're collecting from)
        const collectFrom = jobData.collect_from || jobData.recipient_name || jobData.deliver_to_collect_from || 'Unknown Sender';
        console.log(`👤 Service - collect_from: ${collectFrom}`);

        const numberOfLabels = parseInt(jobData.boxes) || parseInt(jobData.cartons) || parseInt(jobData.number_of_shipping_labels) || 1;

        // 👇 CRITICAL FIX: Use deliver_to_collect_from for collection sender
        const data = {
            do_number: jobData.do_number || `COL-${Date.now()}`,
            address: jobData.address || jobData.address_1 || jobData.collection_address || 'Address required',
            deliver_to_collect_from: collectFrom,  // 👈 This is the sender name for collections
            collect_from: collectFrom,
            date: jobData.date || jobData.scheduled_date || new Date().toISOString().split('T')[0],
            phone: jobData.phone || jobData.recipient_phone || '',
            notify_email: jobData.notify_email || jobData.customer_email || '',
            instructions: jobData.instructions || jobData.special_instructions || '',
            collection_time: jobData.collection_time || jobData.time_window || '07:00-18:00',
            number_of_shipping_labels: numberOfLabels,
            address_1: jobData.address_1 || jobData.collection_address || jobData.address || '',
            address_2: jobData.address_2 || '',
            postal_code: jobData.postal_code || '',
            city: jobData.city || '',
            state: jobData.state || '',
            country: jobData.country || 'Australia',
            company_name: jobData.company_name || jobData.recipient_company || '',
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
            type: 'Collection',
            items: jobData.items || []
        };

        // If group_id is provided, add it to the payload
        if (jobData.group_id) {
            data.group_id = jobData.group_id;
            console.log(`✅ Using group_id: ${jobData.group_id}`);
        }

        // 👇 CRITICAL FIX: Always include deliver_to_collect_from for collections
        const cleanData = {};
        Object.keys(data).forEach(key => {
            if (key === 'deliver_to_collect_from') {
                cleanData[key] = data[key] || 'Unknown Sender';
            } else if (data[key] !== '' && data[key] !== null && data[key] !== undefined) {
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

        // ✅ CREATE COLLECTION: Use /api/v2/jobs for POST (not /dn/)
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
      // ✅ GET: Use /api/v2/jobs (not /dn/)
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

  // ===== GET JOBS WITH FILTERS - Uses /api/v2/jobs (returns total_count) =====
  static async getJobsWithFilters(filters = {}) {
    try {
      console.log('📡 Fetching jobs from Detrack with filters:', filters);

      const queryParams = new URLSearchParams();
      if (filters.date) {
        queryParams.append('date', filters.date);
      }
      if (filters.group_id) {
        queryParams.append('group_id', filters.group_id);
        console.log('✅ Adding group_id filter:', filters.group_id);
      }
      if (filters.type) {
        queryParams.append('type', filters.type);
      }
      if (filters.page) {
        queryParams.append('page', filters.page);
      }
      if (filters.limit) {
        queryParams.append('limit', filters.limit);
      }

      // ✅ GET: Use /api/v2/jobs (returns total_count)
      const url = `${DETRACK_API_URL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

      console.log('📡 Final Detrack URL (GET):', url);

      const response = await axios.get(url, {
        headers: {
          'X-API-KEY': DETRACK_API_KEY,
          'User-Agent': 'curl/7.68.0'
        },
        timeout: 30000
      });

      // ✅ LOG THE FULL RESPONSE TO SEE total_count
      console.log('📊 Detrack response full:', {
        dataLength: response.data?.data?.length || 0,
        total_count: response.data?.total_count || 0,
        links: response.data?.links || {}
      });

      // ✅ Return the FULL response including total_count
      return {
        data: response.data?.data || [],
        links: response.data?.links || {},
        total_count: response.data?.total_count || 0
      };
    } catch (error) {
      console.error('❌ Error fetching jobs with filters:', error.message);
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
      // ✅ GET: Use /api/v2/jobs
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

  // ===== GET JOB BY DO NUMBER =====
  static async getJobByDoNumber(doNumber) {
    try {
      console.log(`📡 Fetching job by DO number: ${doNumber} from Detrack...`);
      // ✅ GET: Use /api/v2/jobs (not /dn/)
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

  // ===== CANCEL JOB - Uses /api/v2/dn/jobs for PUT =====
  static async cancelJob(doNumber) {
    try {
      console.log(`🚫 Cancelling job: ${doNumber}`);

      // First, get the job to check if it exists
      const job = await this.getJobByDoNumber(doNumber);
      if (!job) {
        throw new Error(`Job ${doNumber} not found in Detrack`);
      }

      // Update status to 'cancelled'
      const payload = {
        data: {
          status: 'cancelled',
          reason: 'Cancelled by user'
        }
      };

      console.log(`📤 Sending cancellation payload:`, JSON.stringify(payload, null, 2));

      // ✅ CANCEL: Use /api/v2/dn/jobs for PUT
      const response = await axios.put(
        `${DETRACK_DN_API_URL}/${doNumber}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': DETRACK_API_KEY,
            'User-Agent': 'curl/7.68.0'
          },
          timeout: 30000
        }
      );

      console.log(`✅ Job ${doNumber} cancelled successfully in Detrack`);
      return response.data;

    } catch (error) {
      console.error(`❌ Failed to cancel job ${doNumber}:`, error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  // ===== UPDATE JOB - Uses /api/v2/dn/jobs for PUT =====
  static async updateJob(doNumber, updateData) {
    try {
      console.log(`✏️ Updating job: ${doNumber}`);
      console.log('📦 Update data:', JSON.stringify(updateData, null, 2));

      // First, get the job to check if it exists
      const job = await this.getJobByDoNumber(doNumber);
      if (!job) {
        throw new Error(`Job ${doNumber} not found in Detrack`);
      }

      // Check if job is completed (cannot update completed jobs)
      const currentStatus = job.status || job.primary_job_status || '';
      if (currentStatus === 'completed' || currentStatus === 'delivered') {
        throw new Error(`Cannot update completed job ${doNumber}`);
      }

      if (currentStatus === 'cancelled') {
        throw new Error(`Cannot update cancelled job ${doNumber}`);
      }

      // Build update payload with CORRECT field mappings
      const payload = { data: {} };

      // 👇 CORRECT FIELD MAPPINGS FOR DETRACK
      const fieldMap = {
        // Address fields
        address: 'address',
        address_1: 'address_1',
        address_2: 'address_2',
        city: 'city',
        state: 'state',
        postal_code: 'postal_code',
        country: 'country',
        
        // Recipient fields
        deliver_to: 'deliver_to',
        
        // 👇 FIX: Detrack uses 'phone_number' for phone
        phone: 'phone_number',
        
        instructions: 'instructions',
        company_name: 'company_name',
        notify_email: 'notify_email',
        time_window: 'time_window',
        date: 'date',
        weight: 'weight',
        
        // 👇 FIX: Detrack uses 'number_of_shipping_labels' for boxes
        boxes: 'number_of_shipping_labels',
        cartons: 'cartons',
      };

      Object.keys(updateData).forEach(key => {
        if (fieldMap[key] && updateData[key] !== undefined && updateData[key] !== null && updateData[key] !== '') {
          payload.data[fieldMap[key]] = updateData[key];
        }
      });

      // 👇 Also set 'boxes' as string for Detrack (some versions use this)
      if (updateData.boxes) {
        payload.data.boxes = String(parseInt(updateData.boxes));
      }

      // Ensure we have at least one field to update
      if (Object.keys(payload.data).length === 0) {
        throw new Error('No valid fields to update');
      }

      console.log(`📤 Sending update payload:`, JSON.stringify(payload, null, 2));

      // ✅ UPDATE: Use /api/v2/dn/jobs for PUT
      const response = await axios.put(
        `${DETRACK_DN_API_URL}/${doNumber}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': DETRACK_API_KEY,
            'User-Agent': 'curl/7.68.0'
          },
          timeout: 30000
        }
      );

      console.log(`✅ Job ${doNumber} updated successfully in Detrack`);
      console.log(`📤 Response:`, JSON.stringify(response.data, null, 2));
      return response.data;

    } catch (error) {
      console.error(`❌ Failed to update job ${doNumber}:`, error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
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