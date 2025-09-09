'use strict';
const { query, getConnection } = require('../db/mysql');
const { sanitizeLike } = require('../utils/validators');
const { logAudit } = require('./audit');

/**
 * Helper to ensure tenant scoping in queries
 */
function tWhere(col = 'tenant_id') {
  return `${col} = ?`;
}

/**
 * Map contact rows to API model including tags and categories
 */
async function hydrateContacts(tenantId, rows) {
  if (!rows.length) return [];

  const ids = rows.map(r => r.id);
  const idsPlaceholders = ids.map(() => '?').join(',');
  const { rows: tagRows } = await query(
    'SELECT ct.contact_id, t.name ' +
      'FROM contact_tags ct ' +
      'JOIN tags t ON t.id = ct.tag_id AND ' + tWhere('t.tenant_id') + ' ' +
      `WHERE ct.contact_id IN (${idsPlaceholders})`,
    [tenantId, ...ids]
  );

  const { rows: catRows } = await query(
    'SELECT cc.contact_id, c.name ' +
      'FROM contact_categories cc ' +
      'JOIN categories c ON c.id = cc.category_id AND ' + tWhere('c.tenant_id') + ' ' +
      `WHERE cc.contact_id IN (${idsPlaceholders})`,
    [tenantId, ...ids]
  );

  const tagsByContact = {};
  for (const tr of tagRows) {
    if (!tagsByContact[tr.contact_id]) tagsByContact[tr.contact_id] = [];
    tagsByContact[tr.contact_id].push(tr.name);
  }
  const catsByContact = {};
  for (const cr of catRows) {
    if (!catsByContact[cr.contact_id]) catsByContact[cr.contact_id] = [];
    catsByContact[cr.contact_id].push(cr.name);
  }

  return rows.map(r => ({
    ...r,
    tags: tagsByContact[r.id] || [],
    categories: catsByContact[r.id] || [],
  }));
}

/**
 * PUBLIC_INTERFACE
 * createContact
 * Creates a contact with optional tags, categories, and custom_fields.
 */
async function createContact(tenantId, user, payload) {
  /** Create a new contact inside transaction for integrity. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const sql =
      'INSERT INTO contacts ' +
      '(tenant_id, name, email, phone, company, address, custom_fields, created_at, updated_at, dedupe_key) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), SHA2(CONCAT(?, '|', IFNULL(?,''), '|', IFNULL(?,'')), 256))";
    const custom = payload.custom_fields ? JSON.stringify(payload.custom_fields) : null;
    const params = [
      tenantId,
      payload.name || null,
      payload.email || null,
      payload.phone || null,
      payload.company || null,
      payload.address || null,
      custom,
      (payload.name || '').trim(),
      (payload.email || '').toLowerCase(),
      (payload.phone || '').replace(/\s+/g, ''),
    ];

    const [result] = await conn.execute(sql, params);
    const contactId = result.insertId;

    // tags
    if (Array.isArray(payload.tags) && payload.tags.length) {
      for (const tag of payload.tags) {
        const [tagRes] = await conn.execute(
          'INSERT INTO tags (tenant_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
          [tenantId, tag]
        );
        const selTag = await conn.execute(
          `SELECT id FROM tags WHERE ${tWhere()} AND name = ?`,
          [tenantId, tag]
        );
        const tagId = tagRes.insertId || selTag[0][0]?.id;

        await conn.execute(
          'INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
          [contactId, tagId]
        );
      }
    }

    // categories
    if (Array.isArray(payload.categories) && payload.categories.length) {
      for (const cat of payload.categories) {
        const [catRes] = await conn.execute(
          'INSERT INTO categories (tenant_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
          [tenantId, cat]
        );
        const selCat = await conn.execute(
          `SELECT id FROM categories WHERE ${tWhere()} AND name = ?`,
          [tenantId, cat]
        );
        const categoryId = catRes.insertId || selCat[0][0]?.id;

        await conn.execute(
          'INSERT IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)',
          [contactId, categoryId]
        );
      }
    }

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'contact',
      entityId: contactId,
      action: 'create',
      details: { payload },
    });

    const { rows } = await query(`SELECT * FROM contacts WHERE id = ? AND ${tWhere()}`, [contactId, tenantId]);
    const contact = (await hydrateContacts(tenantId, rows))[0] || null;
    return contact;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * getContactById
 */
async function getContactById(tenantId, id) {
  /** Fetch a single contact with tags/categories. */
  const { rows } = await query(`SELECT * FROM contacts WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  const list = await hydrateContacts(tenantId, rows);
  return list[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * listContacts
 * Supports search, filtering by tags/categories, and pagination.
 */
async function listContacts(tenantId, filters = {}, page = 1, limit = 25, sort = '') {
  /** List contacts with filters and pagination. */
  const where = [`${tWhere()}`];
  const params = [tenantId];

  if (filters.q) {
    const like = '%' + sanitizeLike(filters.q) + '%';
    // Avoid template literal here; use regular string and keep single quotes
    where.push('(name LIKE ? ESCAPE \'\\\\\' OR email LIKE ? ESCAPE \'\\\\\' OR phone LIKE ? ESCAPE \'\\\\\' OR company LIKE ? ESCAPE \'\\\\\')');
    params.push(like, like, like, like);
  }
  if (filters.company) {
    where.push('company = ?');
    params.push(filters.company);
  }
  if (filters.email) {
    where.push('email = ?');
    params.push(filters.email);
  }

  let join = '';
  if (Array.isArray(filters.tags) && filters.tags.length) {
    join += '\n      JOIN contact_tags ct ON ct.contact_id = c.id\n      JOIN tags t ON t.id = ct.tag_id AND ' + tWhere('t.tenant_id') + '\n    ';
    where.push(`t.name IN (${filters.tags.map(() => '?').join(',')})`);
    params.push(tenantId, ...filters.tags);
  }
  if (Array.isArray(filters.categories) && filters.categories.length) {
    join += '\n      JOIN contact_categories cc ON cc.contact_id = c.id\n      JOIN categories cat ON cat.id = cc.category_id AND ' + tWhere('cat.tenant_id') + '\n    ';
    where.push(`cat.name IN (${filters.categories.map(() => '?').join(',')})`);
    params.push(tenantId, ...filters.categories);
  }

  const offset = (page - 1) * limit;
  const order = sort ? ` ORDER BY ${sort}` : ' ORDER BY updated_at DESC';

  const sql =
    'SELECT SQL_CALC_FOUND_ROWS c.* ' +
    'FROM contacts c ' +
    `${join} ` +
    'WHERE ' + where.join(' AND ') + ' ' +
    'GROUP BY c.id ' +
    `${order} ` +
    'LIMIT ? OFFSET ?';
  const { rows } = await query(sql, [...params, limit, offset]);
  const [{ rows: totalRows }] = await Promise.all([
    query('SELECT FOUND_ROWS() as total'),
  ]);
  const total = totalRows[0]?.total || 0;

  const data = await hydrateContacts(tenantId, rows);
  return { data, page, limit, total };
}

/**
 * PUBLIC_INTERFACE
 * updateContact
 */
async function updateContact(tenantId, user, id, payload) {
  /** Update base fields and re-sync tags/categories in a transaction. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const custom = payload.custom_fields ? JSON.stringify(payload.custom_fields) : undefined;
    const fields = [];
    const params = [];

    const columns = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      company: 'company',
      address: 'address',
    };
    for (const [key, col] of Object.entries(columns)) {
      if (payload[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(payload[key]);
      }
    }
    if (payload.custom_fields !== undefined) {
      fields.push('custom_fields = ?');
      params.push(custom);
    }
    if (!fields.length) {
      // still touch updated_at
      fields.push('updated_at = NOW()');
    } else {
      fields.push('updated_at = NOW()');
    }

    const sql =
      'UPDATE contacts SET ' +
      fields.join(', ') + ', ' +
      "dedupe_key = SHA2(CONCAT(IFNULL(name,''), '|', IFNULL(LOWER(email),''), '|', IFNULL(REPLACE(phone,' ',''),'')), 256) " +
      'WHERE id = ? AND ' + tWhere();
    params.push(id, tenantId);
    await conn.execute(sql, params);

    // Sync tags
    if (Array.isArray(payload.tags)) {
      // clear existing
      await conn.execute(
        'DELETE ct FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ? AND ' + tWhere('t.tenant_id'),
        [id, tenantId]
      );
      for (const tag of payload.tags) {
        const [tagRes] = await conn.execute(
          'INSERT INTO tags (tenant_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
          [tenantId, tag]
        );
        const selTag = await conn.execute(
          `SELECT id FROM tags WHERE ${tWhere()} AND name = ?`,
          [tenantId, tag]
        );
        const tagId = tagRes.insertId || selTag[0][0]?.id;
        await conn.execute(
          'INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
          [id, tagId]
        );
      }
    }

    // Sync categories
    if (Array.isArray(payload.categories)) {
      await conn.execute(
        'DELETE cc FROM contact_categories cc JOIN categories c ON c.id = cc.category_id WHERE cc.contact_id = ? AND ' + tWhere('c.tenant_id'),
        [id, tenantId]
      );
      for (const cat of payload.categories) {
        const [catRes] = await conn.execute(
          'INSERT INTO categories (tenant_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
          [tenantId, cat]
        );
        const selCat = await conn.execute(
          `SELECT id FROM categories WHERE ${tWhere()} AND name = ?`,
          [tenantId, cat]
        );
        const categoryId = catRes.insertId || selCat[0][0]?.id;
        await conn.execute(
          'INSERT IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)',
          [id, categoryId]
        );
      }
    }

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'contact',
      entityId: id,
      action: 'update',
      details: { payload },
    });

    return getContactById(tenantId, id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * deleteContact
 * Cascade delete link tables; preserve audit trail.
 */
async function deleteContact(tenantId, user, id) {
  /** Deletes contact and associated links. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM contact_tags WHERE contact_id = ?', [id]);
    await conn.execute('DELETE FROM contact_categories WHERE contact_id = ?', [id]);
    await conn.execute(`DELETE FROM notes WHERE contact_id = ? AND ${tWhere()}`, [id, tenantId]);
    await conn.execute(`DELETE FROM interaction_timeline WHERE contact_id = ? AND ${tWhere()}`, [id, tenantId]);
    await conn.execute(`DELETE FROM contacts WHERE id = ? AND ${tWhere()}`, [id, tenantId]);

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'contact',
      entityId: id,
      action: 'delete',
      details: {},
    });

    return { success: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * addNote
 */
async function addNote(tenantId, user, contactId, content) {
  /** Add a note to contact */
  const sql =
    'INSERT INTO notes (tenant_id, contact_id, content, created_by, created_at) VALUES (?, ?, ?, ?, NOW())';
  await query(sql, [tenantId, contactId, content, user?.id || null]);

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'contact',
    entityId: contactId,
    action: 'note_add',
    details: { content },
  });
}

/**
 * PUBLIC_INTERFACE
 * getNotes
 */
async function getNotes(tenantId, contactId) {
  /** Retrieve notes for a contact */
  const { rows } = await query(
    `SELECT id, content, created_by, created_at 
     FROM notes WHERE contact_id = ? AND ${tWhere()} ORDER BY created_at DESC`,
    [contactId, tenantId]
  );
  return rows;
}

/**
 * PUBLIC_INTERFACE
 * addTimelineEvent
 */
async function addTimelineEvent(tenantId, user, contactId, event) {
  /** Add interaction timeline event */
  const sql =
    'INSERT INTO interaction_timeline (tenant_id, contact_id, type, metadata, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
  await query(sql, [
    tenantId,
    contactId,
    event.type,
    JSON.stringify(event.metadata || {}),
    user?.id || null,
  ]);

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'contact',
    entityId: contactId,
    action: 'timeline_add',
    details: { event },
  });
}

/**
 * PUBLIC_INTERFACE
 * getTimeline
 */
async function getTimeline(tenantId, contactId) {
  /** Get interaction timeline for contact */
  const { rows } = await query(
    `SELECT id, type, metadata, created_by, created_at 
     FROM interaction_timeline
     WHERE contact_id = ? AND ${tWhere()}
     ORDER BY created_at DESC`,
    [contactId, tenantId]
  );
  return rows.map(r => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * PUBLIC_INTERFACE
 * detectDuplicates
 * Finds contacts with same dedupe_key computed from (name,email,phone).
 */
async function detectDuplicates(tenantId) {
  /** Return clusters of duplicate contacts. */
  const { rows } = await query(
    `SELECT dedupe_key, GROUP_CONCAT(id) AS ids, COUNT(*) as count
     FROM contacts
     WHERE ${tWhere()}
     GROUP BY dedupe_key
     HAVING COUNT(*) > 1`,
    [tenantId]
  );
  return rows.map(r => ({
    dedupe_key: r.dedupe_key,
    ids: r.ids.split(',').map(v => parseInt(v, 10)),
    count: r.count,
  }));
}

/**
 * PUBLIC_INTERFACE
 * mergeContacts
 * Merge sourceIds into targetId; keep target’s main fields if provided or else existing.
 */
async function mergeContacts(tenantId, user, targetId, sourceIds = [], updates = {}) {
  /** Merge multiple contacts into target, migrating notes/timeline/tags/categories. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // Update target fields if provided
    if (Object.keys(updates).length) {
      const fields = [];
      const params = [];
      for (const [k, v] of Object.entries(updates)) {
        if (['name', 'email', 'phone', 'company', 'address', 'custom_fields'].includes(k)) {
          if (k === 'custom_fields') {
            fields.push(`${k} = ?`);
            params.push(JSON.stringify(v));
          } else {
            fields.push(`${k} = ?`);
            params.push(v);
          }
        }
      }
      if (fields.length) {
        await conn.execute(
          `UPDATE contacts SET ${fields.join(', ')}, updated_at = NOW()
           WHERE id = ? AND ${tWhere()}`,
          [...params, targetId, tenantId]
        );
      }
    }

    // Reassign notes and timeline
    if (sourceIds.length) {
      await conn.execute(
        `UPDATE notes SET contact_id = ? WHERE contact_id IN (${sourceIds.map(() => '?').join(',')}) AND ${tWhere()}`,
        [targetId, ...sourceIds, tenantId]
      );
      await conn.execute(
        `UPDATE interaction_timeline SET contact_id = ? WHERE contact_id IN (${sourceIds.map(() => '?').join(',')}) AND ${tWhere()}`,
        [targetId, ...sourceIds, tenantId]
      );
      // Tags
      await conn.execute(
        `INSERT IGNORE INTO contact_tags (contact_id, tag_id)
         SELECT ?, tag_id FROM contact_tags WHERE contact_id IN (${sourceIds.map(() => '?').join(',')})`,
        [targetId, ...sourceIds]
      );
      // Categories
      await conn.execute(
        `INSERT IGNORE INTO contact_categories (contact_id, category_id)
         SELECT ?, category_id FROM contact_categories WHERE contact_id IN (${sourceIds.map(() => '?').join(',')})`,
        [targetId, ...sourceIds]
      );
      // Delete sources
      await conn.execute(
        `DELETE FROM contact_tags WHERE contact_id IN (${sourceIds.map(() => '?').join(',')})`,
        [...sourceIds]
      );
      await conn.execute(
        `DELETE FROM contact_categories WHERE contact_id IN (${sourceIds.map(() => '?').join(',')})`,
        [...sourceIds]
      );
      await conn.execute(
        `DELETE FROM contacts WHERE id IN (${sourceIds.map(() => '?').join(',')}) AND ${tWhere()}`,
        [...sourceIds, tenantId]
      );
    }

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'contact',
      entityId: targetId,
      action: 'merge',
      details: { sourceIds, updates },
    });

    return getContactById(tenantId, targetId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * bulkImport
 * Accepts an array of contact objects and inserts/updates them.
 */
async function bulkImport(tenantId, user, contacts = []) {
  /** Upsert many contacts based on email/phone as natural keys. */
  const conn = await getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();

    for (const c of contacts) {
      // Try to find by email or phone
      const [exist] = await conn.execute(
        `SELECT id FROM contacts WHERE ${tWhere()} AND (email = ? OR phone = ?) LIMIT 1`,
        [tenantId, c.email || null, c.phone || null]
      );
      if (exist.length) {
        const id = exist[0].id;
        await conn.execute(
          'UPDATE contacts SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), ' +
            'company = COALESCE(?, company), address = COALESCE(?, address), custom_fields = COALESCE(?, custom_fields), updated_at = NOW() ' +
            'WHERE id = ? AND ' + tWhere(),
          [
            c.name || null,
            c.email || null,
            c.phone || null,
            c.company || null,
            c.address || null,
            c.custom_fields ? JSON.stringify(c.custom_fields) : null,
            id,
            tenantId,
          ]
        );
        updated += 1;
      } else {
        await conn.execute(
          'INSERT INTO contacts (tenant_id, name, email, phone, company, address, custom_fields, created_at, updated_at, dedupe_key) ' +
            "VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), SHA2(CONCAT(?, '|', IFNULL(?,''), '|', IFNULL(?,'')), 256))",
          [
            tenantId,
            c.name || null,
            c.email || null,
            c.phone || null,
            c.company || null,
            c.address || null,
            c.custom_fields ? JSON.stringify(c.custom_fields) : null,
            (c.name || '').trim(),
            (c.email || '').toLowerCase(),
            (c.phone || '').replace(/\s+/g, ''),
          ]
        );
        inserted += 1;
      }
    }

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'contact',
      entityId: null,
      action: 'bulk_import',
      details: { inserted, updated, count: contacts.length },
    });

    return { inserted, updated, total: contacts.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * exportToCSV
 */
async function exportToCSV(tenantId, filters = {}) {
  /** Export contacts as CSV string. */
  const { data } = await listContacts(tenantId, filters, 1, 10000);
  const header = ['id', 'name', 'email', 'phone', 'company', 'address', 'tags', 'categories'];
  const rows = [header.join(',')];
  for (const c of data) {
    const line = [
      c.id,
      JSON.stringify(c.name || ''),
      JSON.stringify(c.email || ''),
      JSON.stringify(c.phone || ''),
      JSON.stringify(c.company || ''),
      JSON.stringify(c.address || ''),
      JSON.stringify((c.tags || []).join('|')),
      JSON.stringify((c.categories || []).join('|')),
    ].join(',');
    rows.push(line);
  }
  return rows.join('\n');
}

/**
 * PUBLIC_INTERFACE
 * exportToXLSX
 * For simplicity and to avoid external deps, return CSV but with .xlsx hint.
 * Frontend can save with .xlsx if needed; future step can add real XLSX gen.
 */
async function exportToXLSX(tenantId, filters = {}) {
  /** Return CSV content pretending as Excel-friendly input. */
  return exportToCSV(tenantId, filters);
}

module.exports = {
  // PUBLIC_INTERFACE
  createContact,
  // PUBLIC_INTERFACE
  getContactById,
  // PUBLIC_INTERFACE
  listContacts,
  // PUBLIC_INTERFACE
  updateContact,
  // PUBLIC_INTERFACE
  deleteContact,
  // PUBLIC_INTERFACE
  addNote,
  // PUBLIC_INTERFACE
  getNotes,
  // PUBLIC_INTERFACE
  addTimelineEvent,
  // PUBLIC_INTERFACE
  getTimeline,
  // PUBLIC_INTERFACE
  detectDuplicates,
  // PUBLIC_INTERFACE
  mergeContacts,
  // PUBLIC_INTERFACE
  bulkImport,
  // PUBLIC_INTERFACE
  exportToCSV,
  // PUBLIC_INTERFACE
  exportToXLSX,
};
