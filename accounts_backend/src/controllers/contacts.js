'use strict';
const contactsService = require('../services/contacts');
const { parsePagination, parseSort } = require('../utils/validators');

/**
 * PUBLIC_INTERFACE
 * ContactsController
 * Handles HTTP request/response for contacts endpoints.
 */
class ContactsController {
  /** Create a new contact */
  async create(req, res) {
    try {
      const contact = await contactsService.createContact(req.tenantId, req.user, req.body);
      res.status(201).json(contact);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Get contact by id */
  async getById(req, res) {
    try {
      const c = await contactsService.getContactById(req.tenantId, parseInt(req.params.id, 10));
      if (!c) return res.status(404).json({ message: 'Not found' });
      res.json(c);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** List with filters, search, pagination */
  async list(req, res) {
    try {
      const { limit, page } = parsePagination(req.query);
      const sort = parseSort(req.query, ['name', 'email', 'company', 'updated_at']) || '';
      const filters = {
        q: req.query.q,
        company: req.query.company,
        email: req.query.email,
        tags: req.query.tags ? String(req.query.tags).split(',').map(s => s.trim()).filter(Boolean) : undefined,
        categories: req.query.categories ? String(req.query.categories).split(',').map(s => s.trim()).filter(Boolean) : undefined,
      };
      const result = await contactsService.listContacts(req.tenantId, filters, page, limit, sort.replace(' ORDER BY ', ''));
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Update contact */
  async update(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await contactsService.updateContact(req.tenantId, req.user, id, req.body);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Delete contact */
  async remove(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await contactsService.deleteContact(req.tenantId, req.user, id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Add note */
  async addNote(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { content } = req.body || {};
      if (!content) return res.status(400).json({ message: 'content required' });
      await contactsService.addNote(req.tenantId, req.user, id, content);
      const notes = await contactsService.getNotes(req.tenantId, id);
      res.status(201).json({ notes });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Get notes */
  async getNotes(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const notes = await contactsService.getNotes(req.tenantId, id);
      res.json({ notes });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Add timeline event */
  async addTimeline(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { type, metadata } = req.body || {};
      if (!type) return res.status(400).json({ message: 'type required' });
      await contactsService.addTimelineEvent(req.tenantId, req.user, id, { type, metadata });
      const tl = await contactsService.getTimeline(req.tenantId, id);
      res.status(201).json({ timeline: tl });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Get timeline */
  async getTimeline(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const tl = await contactsService.getTimeline(req.tenantId, id);
      res.json({ timeline: tl });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Detect duplicates */
  async duplicates(req, res) {
    try {
      const d = await contactsService.detectDuplicates(req.tenantId);
      res.json({ duplicates: d });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Merge contacts */
  async merge(req, res) {
    try {
      const targetId = parseInt(req.params.id, 10);
      const { sourceIds, updates } = req.body || {};
      if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
        return res.status(400).json({ message: 'sourceIds required' });
      }
      const updated = await contactsService.mergeContacts(req.tenantId, req.user, targetId, sourceIds, updates || {});
      res.json(updated);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Bulk import */
  async bulkImport(req, res) {
    try {
      const { contacts } = req.body || {};
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ message: 'contacts array required' });
      }
      const result = await contactsService.bulkImport(req.tenantId, req.user, contacts);
      res.status(202).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Export CSV */
  async exportCSV(req, res) {
    try {
      const csv = await contactsService.exportToCSV(req.tenantId, req.query || {});
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
      res.status(200).send(csv);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  /** Export Excel (CSV content for now) */
  async exportXLSX(req, res) {
    try {
      const csv = await contactsService.exportToXLSX(req.tenantId, req.query || {});
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="contacts.xlsx"');
      res.status(200).send(csv);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new ContactsController();
