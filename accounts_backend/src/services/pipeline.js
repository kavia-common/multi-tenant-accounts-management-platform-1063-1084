'use strict';
const { query, getConnection } = require('../db/mysql');
const { logAudit } = require('./audit');

/**
 * Helper for tenant scoping
 */
function tWhere(col = 'tenant_id') {
  return `${col} = ?`;
}

/**
 * PUBLIC_INTERFACE
 * ensureStageOrderGap
 * Normalize stage position ordering (1..N) for a tenant's pipeline.
 */
async function ensureStageOrderGap(tenantId, conn = null) {
  /** Reorders the stages to remove gaps after insert/delete/drag-drop. */
  const exec = conn ? conn.execute.bind(conn) : query.bind(null);
  const { rows } = await (conn
    ? conn.execute(`SELECT id FROM pipeline_stages WHERE ${tWhere()} ORDER BY position ASC, id ASC`, [tenantId])
    : query(`SELECT id FROM pipeline_stages WHERE ${tWhere()} ORDER BY position ASC, id ASC`, [tenantId]));
  const ids = (rows || [])[0] ? rows.map(r => r.id) : (rows || []);
  let pos = 1;
  for (const id of ids) {
    await exec(`UPDATE pipeline_stages SET position = ? WHERE id = ? AND ${tWhere()}`, [pos, id, tenantId]);
    pos += 1;
  }
}

/**
 * PUBLIC_INTERFACE
 * createStage
 * Create a sales stage in the pipeline with optional position.
 */
async function createStage(tenantId, user, payload) {
  /** Insert a pipeline stage and normalize ordering. */
  if (!payload || !payload.name) throw new Error('name required');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    let position = payload.position;
    if (!position) {
      const [rows] = await conn.execute(
        `SELECT COALESCE(MAX(position), 0) + 1 as nextPos FROM pipeline_stages WHERE ${tWhere()}`,
        [tenantId]
      );
      position = rows[0]?.nextPos || 1;
    }
    const [result] = await conn.execute(
      `INSERT INTO pipeline_stages (tenant_id, name, position, is_won, is_lost, probability, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        tenantId,
        payload.name,
        position,
        !!payload.is_won,
        !!payload.is_lost,
        payload.probability != null ? Math.max(0, Math.min(100, parseInt(payload.probability, 10) || 0)) : null,
      ]
    );
    await ensureStageOrderGap(tenantId, conn);
    const stageId = result.insertId;
    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'pipeline_stage',
      entityId: stageId,
      action: 'create',
      details: { payload },
    });

    const { rows: stageRows } = await query(
      `SELECT * FROM pipeline_stages WHERE id = ? AND ${tWhere()}`,
      [stageId, tenantId]
    );
    return stageRows[0] || null;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * listStages
 * Return ordered list of stages for tenant.
 */
async function listStages(tenantId) {
  /** Get all stages ordered by position. */
  const { rows } = await query(
    `SELECT * FROM pipeline_stages WHERE ${tWhere()} ORDER BY position ASC`,
    [tenantId]
  );
  return rows;
}

/**
 * PUBLIC_INTERFACE
 * updateStage
 */
async function updateStage(tenantId, user, id, payload) {
  /** Update stage fields and return updated row. */
  const fields = [];
  const params = [];
  const map = {
    name: 'name',
    position: 'position',
    is_won: 'is_won',
    is_lost: 'is_lost',
    probability: 'probability',
  };
  for (const [k, col] of Object.entries(map)) {
    if (payload[k] !== undefined) {
      if (k === 'probability') {
        fields.push(`${col} = ?`);
        params.push(Math.max(0, Math.min(100, parseInt(payload[k], 10) || 0)));
      } else {
        fields.push(`${col} = ?`);
        params.push(payload[k]);
      }
    }
  }
  if (!fields.length) {
    fields.push('updated_at = NOW()');
  } else {
    fields.push('updated_at = NOW()');
  }
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE pipeline_stages SET ${fields.join(', ')} WHERE id = ? AND ${tWhere()}`,
      [...params, id, tenantId]
    );
    await ensureStageOrderGap(tenantId, conn);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'pipeline_stage',
    entityId: id,
    action: 'update',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM pipeline_stages WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * deleteStage
 */
async function deleteStage(tenantId, user, id) {
  /** Delete a stage and move deals in this stage to next stage (if exists) or previous. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute(
      `SELECT id, position FROM pipeline_stages WHERE id = ? AND ${tWhere()} LIMIT 1`,
      [id, tenantId]
    );
    if (!r.length) {
      await conn.rollback();
      return { success: true };
    }
    const position = r[0].position;

    const [nextStage] = await conn.execute(
      `SELECT id FROM pipeline_stages WHERE ${tWhere()} AND position > ? ORDER BY position ASC LIMIT 1`,
      [tenantId, position]
    );
    const [prevStage] = await conn.execute(
      `SELECT id FROM pipeline_stages WHERE ${tWhere()} AND position < ? ORDER BY position DESC LIMIT 1`,
      [tenantId, position]
    );
    const moveTo = (nextStage[0]?.id) || (prevStage[0]?.id) || null;

    if (moveTo) {
      await conn.execute(
        `UPDATE deals SET stage_id = ?, updated_at = NOW()
         WHERE ${tWhere()} AND stage_id = ?`,
        [moveTo, tenantId, id]
      );
    }

    await conn.execute(
      `DELETE FROM pipeline_stages WHERE id = ? AND ${tWhere()}`,
      [id, tenantId]
    );
    await ensureStageOrderGap(tenantId, conn);
    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'pipeline_stage',
      entityId: id,
      action: 'delete',
      details: { moved_deals_to: moveTo },
    });

    return { success: true, movedToStageId: moveTo };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * reorderStages
 * Drag-drop: move a stage to a new position and renumber.
 */
async function reorderStages(tenantId, user, id, newPosition) {
  /** Repositions a stage and normalizes order. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    // Temporarily set position to a sentinel to avoid unique conflicts
    await conn.execute(
      `UPDATE pipeline_stages SET position = -1 WHERE id = ? AND ${tWhere()}`,
      [id, tenantId]
    );
    // Shift others
    await conn.execute(
      `UPDATE pipeline_stages SET position = position + 1 WHERE ${tWhere()} AND position >= ?`,
      [tenantId, newPosition]
    );
    // Place target
    await conn.execute(
      `UPDATE pipeline_stages SET position = ? WHERE id = ? AND ${tWhere()}`,
      [newPosition, id, tenantId]
    );
    await ensureStageOrderGap(tenantId, conn);
    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'pipeline_stage',
      entityId: id,
      action: 'reorder',
      details: { newPosition },
    });

    const { rows } = await query(`SELECT * FROM pipeline_stages WHERE ${tWhere()} ORDER BY position ASC`, [tenantId]);
    return rows;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * createDeal
 * Create a deal in a stage with initial position in Kanban.
 */
async function createDeal(tenantId, user, payload) {
  /** Insert new deal and place at end of stage list. */
  if (!payload || !payload.name || !payload.stage_id) throw new Error('name and stage_id required');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [posRows] = await conn.execute(
      `SELECT COALESCE(MAX(kanban_position), 0) + 1 AS nextPos FROM deals WHERE ${tWhere()} AND stage_id = ?`,
      [tenantId, payload.stage_id]
    );
    const nextPos = posRows[0]?.nextPos || 1;
    const [result] = await conn.execute(
      `INSERT INTO deals
       (tenant_id, name, contact_id, owner_user_id, stage_id, value, currency, probability, expected_close_date,
        kanban_position, status, custom_fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        tenantId,
        payload.name,
        payload.contact_id || null,
        payload.owner_user_id || user?.id || null,
        payload.stage_id,
        payload.value || 0,
        payload.currency || 'USD',
        payload.probability != null ? Math.max(0, Math.min(100, parseInt(payload.probability, 10) || 0)) : null,
        payload.expected_close_date || null,
        nextPos,
        payload.status || 'open',
        payload.custom_fields ? JSON.stringify(payload.custom_fields) : null,
      ]
    );
    const dealId = result.insertId;
    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'deal',
      entityId: dealId,
      action: 'create',
      details: { payload },
    });

    const { rows } = await query(`SELECT * FROM deals WHERE id = ? AND ${tWhere()}`, [dealId, tenantId]);
    return rows[0] || null;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * getDeal
 */
async function getDeal(tenantId, id) {
  /** Retrieve deal by id. */
  const { rows } = await query(`SELECT * FROM deals WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * listDeals
 */
async function listDeals(tenantId, filters = {}, page = 1, limit = 25) {
  /** List deals with optional filters and pagination. */
  const where = [`${tWhere()}`];
  const params = [tenantId];

  if (filters.stage_id) {
    where.push('stage_id = ?');
    params.push(parseInt(filters.stage_id, 10));
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.owner_user_id) {
    where.push('owner_user_id = ?');
    params.push(parseInt(filters.owner_user_id, 10));
  }
  if (filters.q) {
    where.push('(name LIKE ?)');
    params.push(`%${String(filters.q).replace(/[%_]/g, m => '\\' + m)}%`);
  }

  const offset = (page - 1) * limit;
  const sql =
    `SELECT SQL_CALC_FOUND_ROWS * FROM deals WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  const { rows } = await query(sql, [...params, limit, offset]);
  const [{ rows: totalRows }] = await Promise.all([query('SELECT FOUND_ROWS() as total')]);
  const total = totalRows[0]?.total || 0;
  return { data: rows, page, limit, total };
}

/**
 * PUBLIC_INTERFACE
 * updateDeal
 */
async function updateDeal(tenantId, user, id, payload) {
  /** Update mutable deal fields. */
  const fields = [];
  const params = [];
  const map = {
    name: 'name',
    contact_id: 'contact_id',
    owner_user_id: 'owner_user_id',
    stage_id: 'stage_id',
    value: 'value',
    currency: 'currency',
    probability: 'probability',
    expected_close_date: 'expected_close_date',
    status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (payload[k] !== undefined) {
      if (k === 'probability') {
        fields.push(`${col} = ?`);
        params.push(Math.max(0, Math.min(100, parseInt(payload[k], 10) || 0)));
      } else {
        fields.push(`${col} = ?`);
        params.push(payload[k]);
      }
    }
  }
  if (payload.custom_fields !== undefined) {
    fields.push('custom_fields = ?');
    params.push(payload.custom_fields ? JSON.stringify(payload.custom_fields) : null);
  }
  fields.push('updated_at = NOW()');

  const { rows: beforeRows } = await query(`SELECT stage_id FROM deals WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  const prevStage = beforeRows[0]?.stage_id || null;

  await query(
    `UPDATE deals SET ${fields.join(', ')} WHERE id = ? AND ${tWhere()}`,
    [...params, id, tenantId]
  );

  // If stage changed, reposition to end of new stage
  if (payload.stage_id && payload.stage_id !== prevStage) {
    const { rows: posRows } = await query(
      `SELECT COALESCE(MAX(kanban_position), 0) + 1 as nextPos FROM deals WHERE ${tWhere()} AND stage_id = ?`,
      [tenantId, payload.stage_id]
    );
    const nextPos = posRows[0]?.nextPos || 1;
    await query(
      `UPDATE deals SET kanban_position = ? WHERE id = ? AND ${tWhere()}`,
      [nextPos, id, tenantId]
    );
  }

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'deal',
    entityId: id,
    action: 'update',
    details: { payload },
  });

  return getDeal(tenantId, id);
}

/**
 * PUBLIC_INTERFACE
 * deleteDeal
 */
async function deleteDeal(tenantId, user, id) {
  /** Delete a deal. */
  await query(`DELETE FROM deals WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'deal',
    entityId: id,
    action: 'delete',
    details: {},
  });
  return { success: true };
}

/**
 * PUBLIC_INTERFACE
 * moveDeal
 * Drag-drop deal to a different stage and/or position.
 */
async function moveDeal(tenantId, user, id, toStageId, toPosition) {
  /** Move a deal across stages preserving ordering by renumbering collisions. */
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [dealRows] = await conn.execute(
      `SELECT id, stage_id, kanban_position FROM deals WHERE id = ? AND ${tWhere()} LIMIT 1`,
      [id, tenantId]
    );
    if (!dealRows.length) {
      await conn.rollback();
      throw new Error('Deal not found');
    }
    const current = dealRows[0];

    // Remove gap in current stage if moving stages
    if (current.stage_id !== toStageId) {
      await conn.execute(
        `UPDATE deals SET kanban_position = kanban_position - 1
         WHERE ${tWhere()} AND stage_id = ? AND kanban_position > ?`,
        [tenantId, current.stage_id, current.kanban_position]
      );
    }

    // Shift down deals at destination from desired position
    await conn.execute(
      `UPDATE deals SET kanban_position = kanban_position + 1
       WHERE ${tWhere()} AND stage_id = ? AND kanban_position >= ?`,
      [tenantId, toStageId, toPosition]
    );

    // Move the deal
    await conn.execute(
      `UPDATE deals SET stage_id = ?, kanban_position = ?, updated_at = NOW()
       WHERE id = ? AND ${tWhere()}`,
      [toStageId, toPosition, id, tenantId]
    );

    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'deal',
      entityId: id,
      action: 'move',
      details: { toStageId, toPosition },
    });

    return getDeal(tenantId, id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * addActivity
 * Log an activity against a deal (call/email/meeting/task).
 */
async function addActivity(tenantId, user, payload) {
  /** Insert activity log entry for a deal. */
  const required = ['type', 'deal_id'];
  for (const f of required) if (!payload[f]) throw new Error(`${f} required`);
  const [result] = await query(
    `INSERT INTO deal_activities
     (tenant_id, deal_id, type, subject, notes, metadata, due_date, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      tenantId,
      payload.deal_id,
      payload.type,
      payload.subject || null,
      payload.notes || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.due_date || null,
      payload.status || 'open',
      user?.id || null,
    ]
  );
  const id = result.insertId;

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'deal_activity',
    entityId: id,
    action: 'create',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM deal_activities WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * listActivities
 */
async function listActivities(tenantId, filters = {}, page = 1, limit = 50) {
  /** Retrieve activities filtered by deal_id, type, status, owner, due window. */
  const where = [`${tWhere()}`];
  const params = [tenantId];
  if (filters.deal_id) {
    where.push('deal_id = ?');
    params.push(parseInt(filters.deal_id, 10));
  }
  if (filters.type) {
    where.push('type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.created_by) {
    where.push('created_by = ?');
    params.push(parseInt(filters.created_by, 10));
  }
  if (filters.due_from) {
    where.push('due_date >= ?');
    params.push(filters.due_from);
  }
  if (filters.due_to) {
    where.push('due_date <= ?');
    params.push(filters.due_to);
  }
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT SQL_CALC_FOUND_ROWS * FROM deal_activities
     WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ rows: totalRows }] = await Promise.all([query('SELECT FOUND_ROWS() as total')]);
  const total = totalRows[0]?.total || 0;
  return { data: rows, page, limit, total };
}

/**
 * PUBLIC_INTERFACE
 * updateActivity
 */
async function updateActivity(tenantId, user, id, payload) {
  /** Update activity fields. */
  const fields = [];
  const params = [];
  const map = {
    type: 'type',
    subject: 'subject',
    notes: 'notes',
    due_date: 'due_date',
    status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if (payload[k] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(payload[k]);
    }
  }
  if (payload.metadata !== undefined) {
    fields.push('metadata = ?');
    params.push(payload.metadata ? JSON.stringify(payload.metadata) : null);
  }
  fields.push('updated_at = NOW()');
  await query(
    `UPDATE deal_activities SET ${fields.join(', ')} WHERE id = ? AND ${tWhere()}`,
    [...params, id, tenantId]
  );

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'deal_activity',
    entityId: id,
    action: 'update',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM deal_activities WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * deleteActivity
 */
async function deleteActivity(tenantId, user, id) {
  /** Delete an activity log entry. */
  await query(`DELETE FROM deal_activities WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'deal_activity',
    entityId: id,
    action: 'delete',
    details: {},
  });
  return { success: true };
}

/**
 * PUBLIC_INTERFACE
 * forecast
 * Weighted pipeline forecast grouped by stage or owner.
 */
async function forecast(tenantId, params = {}) {
  /** Calculate forecast totals using value * (probability or stage probability)/100. */
  const basis = params.group_by || 'stage'; // 'stage' or 'owner'
  const useDealProb = params.use_deal_probability === 'true' || params.use_deal_probability === true;

  const { rows } = await query(
    `SELECT d.stage_id, d.owner_user_id, d.value, d.probability as deal_prob, s.probability as stage_prob, s.name as stage_name
     FROM deals d
     LEFT JOIN pipeline_stages s ON s.id = d.stage_id AND ${tWhere('s.tenant_id')}
     WHERE d.${tWhere()}`,
    [tenantId, tenantId]
  );

  const agg = {};
  for (const r of rows) {
    const key = basis === 'owner' ? `owner:${r.owner_user_id || 'none'}` : `stage:${r.stage_id || 'none'}`;
    const effectiveProb = useDealProb
      ? (r.deal_prob != null ? r.deal_prob : (r.stage_prob != null ? r.stage_prob : 0))
      : (r.stage_prob != null ? r.stage_prob : (r.deal_prob != null ? r.deal_prob : 0));
    const weighted = (Number(r.value) || 0) * (Number(effectiveProb) || 0) / 100.0;
    if (!agg[key]) agg[key] = { total_value: 0, weighted: 0, count: 0, label: null };
    agg[key].total_value += Number(r.value) || 0;
    agg[key].weighted += weighted;
    agg[key].count += 1;
    if (basis !== 'owner') agg[key].label = r.stage_name || 'Unknown';
  }

  const result = Object.entries(agg).map(([k, v]) => ({
    key: k,
    label: v.label || k,
    total_value: v.total_value,
    weighted: Number(v.weighted.toFixed(2)),
    count: v.count,
  }));
  return { group_by: basis, data: result };
}

/**
 * PUBLIC_INTERFACE
 * funnelAnalytics
 * Compute counts and conversion rates between stages.
 */
async function funnelAnalytics(tenantId) {
  /** Return counts per stage and overall conversion rates between consecutive stages. */
  const { rows: stages } = await query(
    `SELECT id, name, position FROM pipeline_stages WHERE ${tWhere()} ORDER BY position ASC`,
    [tenantId]
  );
  const { rows: counts } = await query(
    `SELECT stage_id, COUNT(*) as cnt FROM deals WHERE ${tWhere()} GROUP BY stage_id`,
    [tenantId]
  );
  const countMap = {};
  for (const c of counts) countMap[c.stage_id] = c.cnt;

  const ordered = stages.map(s => ({
    stage_id: s.id,
    stage_name: s.name,
    count: countMap[s.id] || 0,
  }));

  const conversions = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    const rate = from.count ? (to.count / from.count) : 0;
    conversions.push({
      from_stage_id: from.stage_id,
      to_stage_id: to.stage_id,
      rate: Number(rate.toFixed(3)),
    });
  }

  return { stages: ordered, conversions };
}

/**
 * PUBLIC_INTERFACE
 * conversionTracking
 * Win/Loss tracking totals by stage.
 */
async function conversionTracking(tenantId) {
  /** Compute total won/lost and win rate. */
  const { rows: totals } = await query(
    `SELECT
       SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_cnt,
       SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_cnt,
       COUNT(*) as total
     FROM deals WHERE ${tWhere()}`,
    [tenantId]
  );
  const t = totals[0] || { won_cnt: 0, lost_cnt: 0, total: 0 };
  const winRate = t.total ? (t.won_cnt / t.total) : 0;
  return { total: t.total, won: t.won_cnt, lost: t.lost_cnt, win_rate: Number(winRate.toFixed(3)) };
}

/**
 * PUBLIC_INTERFACE
 * leadScore
 * Naive lead scoring based on activity frequency and recency, and deal value.
 */
async function leadScore(tenantId, contactId) {
  /** Compute a simple score using activities and associated deals. */
  const { rows: deals } = await query(
    `SELECT d.id, d.value, d.updated_at
     FROM deals d WHERE ${tWhere()} AND contact_id = ?`,
    [tenantId, contactId]
  );
  let score = 0;
  for (const d of deals) {
    const { rows: acts } = await query(
      `SELECT COUNT(*) as cnt, MAX(updated_at) as last
       FROM deal_activities WHERE ${tWhere()} AND deal_id = ?`,
      [tenantId, d.id]
    );
    const cnt = acts[0]?.cnt || 0;
    score += Math.min(50, cnt * 5);
    score += Math.min(40, Math.log10((Number(d.value) || 0) + 1) * 10);
  }
  // Bound 0..100
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { contact_id: contactId, score };
}

/**
 * PUBLIC_INTERFACE
 * autoAssignLead
 * Simple routing by round-robin among Sales Reps in tenant (users table expected with role).
 */
async function autoAssignLead(tenantId, contactId) {
  /** Round-robin assignment using last_assigned_user_id per tenant (in organization_settings). */
  // Fetch sales reps
  const { rows: reps } = await query(
    `SELECT u.id FROM users u WHERE ${tWhere()} AND u.role IN ('Sales Rep','Manager') ORDER BY u.id ASC`,
    [tenantId]
  );
  if (!reps.length) return { assigned_user_id: null };

  // Get last assigned
  const { rows: settings } = await query(
    `SELECT last_assigned_user_id FROM organization_settings WHERE ${tWhere()} LIMIT 1`,
    [tenantId]
  );
  let nextRepId = reps[0].id;
  if (settings.length && settings[0].last_assigned_user_id) {
    const idx = reps.findIndex(r => r.id === settings[0].last_assigned_user_id);
    nextRepId = reps[(idx + 1) % reps.length].id;
  }

  // Update setting
  await query(
    `INSERT INTO organization_settings (tenant_id, last_assigned_user_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE last_assigned_user_id = VALUES(last_assigned_user_id)`,
    [tenantId, nextRepId]
  );

  // Assign contact owner
  await query(
    `UPDATE contacts SET owner_user_id = ?, updated_at = NOW() WHERE id = ? AND ${tWhere()}`,
    [nextRepId, contactId, tenantId]
  );

  await logAudit({
    tenantId,
    userId: null,
    entityType: 'lead_assignment',
    entityId: contactId,
    action: 'auto_assign',
    details: { assigned_user_id: nextRepId },
  });

  return { assigned_user_id: nextRepId };
}

/**
 * PUBLIC_INTERFACE
 * createEmailTemplate
 */
async function createEmailTemplate(tenantId, user, payload) {
  /** Create a reusable email template. */
  if (!payload || !payload.name || !payload.subject) throw new Error('name and subject required');
  const [result] = await query(
    `INSERT INTO email_templates (tenant_id, name, subject, body_html, body_text, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      tenantId,
      payload.name,
      payload.subject,
      payload.body_html || null,
      payload.body_text || null,
      user?.id || null,
    ]
  );
  const id = result.insertId;

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'email_template',
    entityId: id,
    action: 'create',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM email_templates WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * listEmailTemplates
 */
async function listEmailTemplates(tenantId, page = 1, limit = 50) {
  /** Paginated templates list. */
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT SQL_CALC_FOUND_ROWS * FROM email_templates WHERE ${tWhere()} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [tenantId, limit, offset]
  );
  const [{ rows: totalRows }] = await Promise.all([query('SELECT FOUND_ROWS() as total')]);
  const total = totalRows[0]?.total || 0;
  return { data: rows, page, limit, total };
}

/**
 * PUBLIC_INTERFACE
 * updateEmailTemplate
 */
async function updateEmailTemplate(tenantId, user, id, payload) {
  /** Update an email template. */
  const fields = [];
  const params = [];
  for (const k of ['name', 'subject', 'body_html', 'body_text']) {
    if (payload[k] !== undefined) {
      fields.push(`${k} = ?`);
      params.push(payload[k]);
    }
  }
  fields.push('updated_at = NOW()');
  await query(
    `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ? AND ${tWhere()}`,
    [...params, id, tenantId]
  );

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'email_template',
    entityId: id,
    action: 'update',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM email_templates WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * deleteEmailTemplate
 */
async function deleteEmailTemplate(tenantId, user, id) {
  /** Delete an email template. */
  await query(`DELETE FROM email_templates WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'email_template',
    entityId: id,
    action: 'delete',
    details: {},
  });
  return { success: true };
}

/**
 * PUBLIC_INTERFACE
 * createEmailSequence
 */
async function createEmailSequence(tenantId, user, payload) {
  /** Create an email sequence with steps. */
  if (!payload || !payload.name) throw new Error('name required');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute(
      `INSERT INTO email_sequences (tenant_id, name, description, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [tenantId, payload.name, payload.description || null, user?.id || null]
    );
    const seqId = res.insertId;
    if (Array.isArray(payload.steps)) {
      let pos = 1;
      for (const step of payload.steps) {
        await conn.execute(
          `INSERT INTO email_sequence_steps (tenant_id, sequence_id, position, template_id, delay_days, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [tenantId, seqId, pos, step.template_id || null, step.delay_days != null ? step.delay_days : pos - 1]
        );
        pos += 1;
      }
    }
    await conn.commit();

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'email_sequence',
      entityId: seqId,
      action: 'create',
      details: { payload },
    });

    const { rows } = await query(`SELECT * FROM email_sequences WHERE id = ? AND ${tWhere()}`, [seqId, tenantId]);
    return rows[0] || null;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * basicSendEmail
 * This is a stub for sending email; it records an intent in email_outbox table.
 * Integration with actual email provider should be added by operations with env vars.
 */
async function basicSendEmail(tenantId, user, payload) {
  /** Queue an email for sending via external provider (not implemented here). */
  if (!payload || !payload.to || !payload.subject) throw new Error('to and subject required');
  const [result] = await query(
    `INSERT INTO email_outbox
      (tenant_id, \`to\`, \`cc\`, \`bcc\`, subject, body_html, body_text, send_after, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, NOW(), NOW())`,
    [
      tenantId,
      String(payload.to),
      payload.cc ? String(payload.cc) : null,
      payload.bcc ? String(payload.bcc) : null,
      payload.subject,
      payload.body_html || null,
      payload.body_text || null,
      payload.send_after || null,
      user?.id || null,
    ]
  );
  const id = result.insertId;

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'email',
    entityId: id,
    action: 'queue',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM email_outbox WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * scheduleAppointment
 */
async function scheduleAppointment(tenantId, user, payload) {
  /** Create a calendar appointment. */
  if (!payload || !payload.title || !payload.start_time || !payload.end_time) {
    throw new Error('title, start_time, end_time required');
  }
  const [result] = await query(
    `INSERT INTO appointments
      (tenant_id, title, description, start_time, end_time, organizer_user_id, attendee_contact_id, location, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      tenantId,
      payload.title,
      payload.description || null,
      payload.start_time,
      payload.end_time,
      user?.id || null,
      payload.attendee_contact_id || null,
      payload.location || null,
    ]
  );
  const id = result.insertId;

  await logAudit({
    tenantId,
    userId: user?.id,
    entityType: 'appointment',
    entityId: id,
    action: 'create',
    details: { payload },
  });

  const { rows } = await query(`SELECT * FROM appointments WHERE id = ? AND ${tWhere()}`, [id, tenantId]);
  return rows[0] || null;
}

/**
 * PUBLIC_INTERFACE
 * listAppointments
 */
async function listAppointments(tenantId, filters = {}, page = 1, limit = 50) {
  /** Paginated appointments with optional date range filter. */
  const where = [`${tWhere()}`];
  const params = [tenantId];
  if (filters.from) {
    where.push('start_time >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('end_time <= ?');
    params.push(filters.to);
  }
  if (filters.organizer_user_id) {
    where.push('organizer_user_id = ?');
    params.push(parseInt(filters.organizer_user_id, 10));
  }
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT SQL_CALC_FOUND_ROWS * FROM appointments
     WHERE ${where.join(' AND ')} ORDER BY start_time DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ rows: totalRows }] = await Promise.all([query('SELECT FOUND_ROWS() as total')]);
  const total = totalRows[0]?.total || 0;
  return { data: rows, page, limit, total };
}

module.exports = {
  // Stages
  // PUBLIC_INTERFACE
  createStage,
  // PUBLIC_INTERFACE
  listStages,
  // PUBLIC_INTERFACE
  updateStage,
  // PUBLIC_INTERFACE
  deleteStage,
  // PUBLIC_INTERFACE
  reorderStages,
  // Deals
  // PUBLIC_INTERFACE
  createDeal,
  // PUBLIC_INTERFACE
  getDeal,
  // PUBLIC_INTERFACE
  listDeals,
  // PUBLIC_INTERFACE
  updateDeal,
  // PUBLIC_INTERFACE
  deleteDeal,
  // PUBLIC_INTERFACE
  moveDeal,
  // Activities
  // PUBLIC_INTERFACE
  addActivity,
  // PUBLIC_INTERFACE
  listActivities,
  // PUBLIC_INTERFACE
  updateActivity,
  // PUBLIC_INTERFACE
  deleteActivity,
  // Analytics/Forecasting
  // PUBLIC_INTERFACE
  forecast,
  // PUBLIC_INTERFACE
  funnelAnalytics,
  // PUBLIC_INTERFACE
  conversionTracking,
  // Lead score/routing
  // PUBLIC_INTERFACE
  leadScore,
  // PUBLIC_INTERFACE
  autoAssignLead,
  // Email templates/sequences and sending
  // PUBLIC_INTERFACE
  createEmailTemplate,
  // PUBLIC_INTERFACE
  listEmailTemplates,
  // PUBLIC_INTERFACE
  updateEmailTemplate,
  // PUBLIC_INTERFACE
  deleteEmailTemplate,
  // PUBLIC_INTERFACE
  createEmailSequence,
  // PUBLIC_INTERFACE
  basicSendEmail,
  // Scheduling
  // PUBLIC_INTERFACE
  scheduleAppointment,
  // PUBLIC_INTERFACE
  listAppointments,
};
