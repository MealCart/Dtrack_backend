// src/controllers/contactController.js
const xlsx = require('xlsx');
const Contact = require('../models/Contact');
const { getValue, getNumber, getValidDate } = require('../utils/helpers');

// ===== GET ALL CONTACTS =====
exports.getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const contacts = await Contact.findAll(userId);
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('❌ Get contacts error:', error);
    res.status(500).json({
      error: 'Failed to fetch contacts',
      details: error.message
    });
  }
};

// ===== GET SINGLE CONTACT =====
exports.getContact = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const contact = await Contact.findById(id, userId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('❌ Get contact error:', error);
    res.status(500).json({
      error: 'Failed to fetch contact',
      details: error.message
    });
  }
};

// ===== CREATE CONTACT =====
exports.createContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactData = req.body;

    if (!contactData.deliver_to) {
      return res.status(400).json({ error: 'Deliver To is required' });
    }

    const contact = await Contact.create({
      ...contactData,
      user_id: userId
    });

    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: contact
    });
  } catch (error) {
    console.error('❌ Create contact error:', error);
    res.status(500).json({
      error: 'Failed to create contact',
      details: error.message
    });
  }
};

// ===== UPDATE CONTACT =====
exports.updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const contactData = req.body;

    const existing = await Contact.findById(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contactData.deliver_to) {
      return res.status(400).json({ error: 'Deliver To is required' });
    }

    const contact = await Contact.update(id, userId, contactData);

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: contact
    });
  } catch (error) {
    console.error('❌ Update contact error:', error);
    res.status(500).json({
      error: 'Failed to update contact',
      details: error.message
    });
  }
};

// ===== DELETE CONTACT =====
exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contact = await Contact.delete(id, userId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully',
      data: contact
    });
  } catch (error) {
    console.error('❌ Delete contact error:', error);
    res.status(500).json({
      error: 'Failed to delete contact',
      details: error.message
    });
  }
};

// ===== SEARCH CONTACTS =====
exports.searchContacts = async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const contacts = await Contact.search(userId, q);
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('❌ Search contacts error:', error);
    res.status(500).json({
      error: 'Failed to search contacts',
      details: error.message
    });
  }
};

// ===== NEW: SEARCH CONTACTS FOR AUTOCOMPLETE =====
exports.searchContactsAutocomplete = async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    console.log(`🔍 Autocomplete search for: "${q}" by user ${userId}`);

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const contacts = await Contact.searchByName(userId, q, 10);
    
    console.log(`✅ Found ${contacts.length} contacts matching "${q}"`);
    
    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('❌ Autocomplete search error:', error);
    res.status(500).json({
      error: 'Failed to search contacts',
      details: error.message
    });
  }
};

// ===== NEW: GET CONTACT DETAILS BY ID =====
exports.getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`🔍 Getting contact ${id} for user ${userId}`);

    const contact = await Contact.getById(id, userId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('❌ Get contact by ID error:', error);
    res.status(500).json({
      error: 'Failed to get contact',
      details: error.message
    });
  }
};

// ===== IMPORT CONTACTS FROM EXCEL =====
exports.importContacts = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📁 Contact import file received from user ${userId}`);
    console.log('📄 File name:', req.file.originalname);
    console.log('📏 File size:', req.file.size, 'bytes');

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    let headerRowIndex = -1;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('deliver to') || rowStr.includes('company name')) {
          headerRowIndex = i;
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: 'No header row found in Excel file' });
    }

    const headers = rawData[headerRowIndex].map(h => h?.toString().trim() || '');
    const dataRows = [];

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every(cell => !cell || cell === '')) continue;
      
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header.trim()] = row[idx] || '';
      });
      dataRows.push(obj);
    }

    console.log(`📊 Found ${dataRows.length} rows to import`);

    const contacts = [];
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const contact = {
        deliver_to: row['Deliver to']?.toString().trim() || '',
        company_name: row['Company Name']?.toString().trim() || '',
        address_1: row['Address 1']?.toString().trim() || '',
        address_2: row['Address 2']?.toString().trim() || '',
        postal_code: row['Postal Code']?.toString().trim() || '',
        city: row['City']?.toString().trim() || '',
        state: row['State']?.toString().trim() || '',
        country: row['Country']?.toString().trim() || 'Australia',
        phone_no: row['Phone No.']?.toString().trim() || '',
        notify_email: row['Notify email']?.toString().trim() || '',
        instructions: row['Instructions']?.toString().trim() || '',
        group_name: row['Group']?.toString().trim() || '',
      };

      if (!contact.deliver_to) {
        errors.push({ row: i + 1, error: 'Missing Deliver To' });
        continue;
      }

      contacts.push(contact);
    }

    if (contacts.length === 0) {
      return res.status(400).json({
        error: 'No valid contacts found in the Excel file',
        errors: errors
      });
    }

    const result = await Contact.bulkCreate(contacts, userId);

    res.json({
      success: true,
      message: `Imported ${result.results.length} contacts successfully`,
      total: contacts.length,
      created: result.results.length,
      failed: result.errors.length,
      errors: result.errors,
      contacts: result.results
    });

  } catch (error) {
    console.error('❌ Import contacts error:', error);
    res.status(500).json({
      error: 'Failed to import contacts',
      details: error.message
    });
  }
};

// ===== EXPORT CONTACTS =====
exports.exportContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const contacts = await Contact.findAll(userId);

    const headers = [
      'Deliver to', 'Company Name', 'Address 1', 'Address 2', 'Postal Code',
      'City', 'State', 'Country', 'Phone No.', 'Notify email', 'Instructions', 'Group'
    ];

    const data = contacts.map(c => [
      c.deliver_to,
      c.company_name || '',
      c.address_1 || '',
      c.address_2 || '',
      c.postal_code || '',
      c.city || '',
      c.state || '',
      c.country || 'Australia',
      c.phone_no || '',
      c.notify_email || '',
      c.instructions || '',
      c.group_name || ''
    ]);

    const ws = xlsx.utils.aoa_to_sheet([headers, ...data]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Contacts');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts_export.xlsx"');
    res.send(buffer);

  } catch (error) {
    console.error('❌ Export contacts error:', error);
    res.status(500).json({
      error: 'Failed to export contacts',
      details: error.message
    });
  }
};