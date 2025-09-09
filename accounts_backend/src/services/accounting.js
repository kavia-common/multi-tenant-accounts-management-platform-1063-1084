'use strict';
const { pgQuery, pgGetClient } = require('../db/postgres');
const { logAudit } = require('./audit');

/**
 * PUBLIC_INTERFACE
 * nextSequential
 * Generates a sequential number for a given sequence code (e.g., 'SALES', 'EXP', 'RCPT', 'VCHR').
 * Relies on Postgres table: sequences(tenant_id, code, last_number, updated_at)
 */
async function nextSequential(tenantId, code, client = null) {
  /** Atomically increments and returns the next sequence number for tenant and code. */
  const c = client || (await pgGetClient());
  let releaseNeeded = false;
  if (!client) {
    releaseNeeded = true;
    await c.query('BEGIN');
  }
  try {
    await c.query(
      `INSERT INTO sequences (tenant_id, code, last_number, updated_at)
       VALUES ($1, $2, 0, NOW())
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId, code]
    );
    const { rows } = await c.query(
      `UPDATE sequences
         SET last_number = last_number + 1,
             updated_at = NOW()
       WHERE tenant_id = $1 AND code = $2
       RETURNING last_number`,
      [tenantId, code]
    );
    if (!rows.length) throw new Error('Sequence update failed');
    const num = rows[0].last_number;
    if (releaseNeeded) await c.query('COMMIT');
    return num;
  } catch (e) {
    if (releaseNeeded) await c.query('ROLLBACK');
    throw e;
  } finally {
    if (releaseNeeded) c.release();
  }
}

/**
 * Compute tax amounts given amount and tax config.
 * taxConfig: { ratePercent: number, inclusive: boolean }
 */
function computeTax(amount, taxConfig) {
  const rate = Number(taxConfig?.ratePercent || 0) / 100;
  const inclusive = !!taxConfig?.inclusive;
  if (!rate) return { net: Number(amount || 0), tax: 0, gross: Number(amount || 0) };
  if (inclusive) {
    const net = Number(amount || 0) / (1 + rate);
    const tax = Number(amount || 0) - net;
    return { net: Number(net.toFixed(2)), tax: Number(tax.toFixed(2)), gross: Number(amount || 0) };
  }
  const tax = Number(amount || 0) * rate;
  const gross = Number(amount || 0) + tax;
  return { net: Number(amount || 0), tax: Number(tax.toFixed(2)), gross: Number(gross.toFixed(2)) };
}

/**
 * Validate multi-payment breakdown matches totals.
 */
function validatePayments(total, payments) {
  const sum = (payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
  if (Number(total || 0).toFixed(2) !== Number(sum).toFixed(2)) {
    throw new Error('Payments do not sum to total amount');
  }
}

/**
 * PUBLIC_INTERFACE
 * getRealtimeBalances
 * Returns balances for cash/bank accounts. Assumes accounts table and ledger entries exist.
 */
async function getRealtimeBalances(tenantId, { account_ids } = {}) {
  /** Aggregate balances by account based on postings. */
  const filter = Array.isArray(account_ids) && account_ids.length ? 'AND l.account_id = ANY($2)' : '';
  const params = Array.isArray(account_ids) && account_ids.length ? [tenantId, account_ids] : [tenantId];
  const { rows } = await pgQuery(
    `SELECT a.id as account_id, a.name, 
            COALESCE(SUM(CASE WHEN l.type='debit' THEN l.amount ELSE -l.amount END), 0) as balance
       FROM accounts a
       LEFT JOIN ledger_entries l ON l.tenant_id = a.tenant_id AND l.account_id = a.id
      WHERE a.tenant_id = $1 ${filter}
      GROUP BY a.id, a.name
      ORDER BY a.name ASC`,
    params
  );
  return rows;
}

/**
 * PUBLIC_INTERFACE
 * postJournal
 * Inserts ledger entries with a voucher number and links to source transaction.
 */
async function postJournal(tenantId, client, {
  date,
  narration,
  lines, // [{account_id, type: 'debit'|'credit', amount}]
  source_table,
  source_id,
  voucher_prefix = 'VCHR',
}) {
  /** Posts balanced journal entries and returns voucher number. */
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('At least two lines required');
  const deb = lines.filter(l => l.type === 'debit').reduce((a, l) => a + Number(l.amount || 0), 0);
  const cre = lines.filter(l => l.type === 'credit').reduce((a, l) => a + Number(l.amount || 0), 0);
  if (Number(deb).toFixed(2) !== Number(cre).toFixed(2)) throw new Error('Journal not balanced');
  const seq = await nextSequential(tenantId, voucher_prefix, client);
  const voucherNo = `${voucher_prefix}-${String(seq).padStart(6, '0')}`;
  // Insert header
  const { rows: hdrRows } = await client.query(
    `INSERT INTO vouchers (tenant_id, voucher_no, date, narration, source_table, source_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     RETURNING id`,
    [tenantId, voucherNo, date, narration || null, source_table || null, source_id || null]
  );
  const voucherId = hdrRows[0].id;
  // Insert lines
  let lineNo = 1;
  for (const ln of lines) {
    await client.query(
      `INSERT INTO ledger_entries
        (tenant_id, voucher_id, account_id, type, amount, line_no, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [tenantId, voucherId, ln.account_id, ln.type, Number(ln.amount), lineNo++]
    );
  }
  return { voucherNo, voucherId };
}

/**
 * PUBLIC_INTERFACE
 * recordSales
 * Creates a sales transaction with auto-journaling and optional multi-payment.
 * Payload:
 * {
 *   date, customer_id, items:[{description, qty, rate, tax: {ratePercent, inclusive}}],
 *   payments:[{method, account_id, amount, reference}],
 *   narration
 * }
 */
async function recordSales(tenantId, user, payload) {
  /** Records sales, calculates tax, generates receipt number, and posts journal. */
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) throw new Error('items required');
  const items = payload.items.map(i => ({
    description: i.description || 'Item',
    qty: Number(i.qty || 1),
    rate: Number(i.rate || 0),
    tax: i.tax || { ratePercent: 0, inclusive: false },
  }));
  // Compute line totals
  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;
  for (const it of items) {
    const lineAmount = it.qty * it.rate;
    const comp = computeTax(lineAmount, it.tax);
    totalNet += comp.net;
    totalTax += comp.tax;
    totalGross += comp.gross;
  }
  if (Array.isArray(payload.payments) && payload.payments.length) {
    validatePayments(totalGross, payload.payments);
  }

  const client = await pgGetClient();
  try {
    await client.query('BEGIN');

    // Create sales header
    const seq = await nextSequential(tenantId, 'SALES', client);
    const receiptNo = `RCPT-${String(seq).padStart(6, '0')}`;

    const { rows: hdrRows } = await client.query(
      `INSERT INTO sales
        (tenant_id, date, customer_id, receipt_no, net_amount, tax_amount, total_amount, narration, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING id`,
      [
        tenantId,
        payload.date || new Date().toISOString().slice(0, 10),
        payload.customer_id || null,
        receiptNo,
        Number(totalNet.toFixed(2)),
        Number(totalTax.toFixed(2)),
        Number(totalGross.toFixed(2)),
        payload.narration || null,
        user?.id || null,
      ]
    );
    const salesId = hdrRows[0].id;

    // Insert items
    let lineNo = 1;
    for (const it of items) {
      const lineAmount = it.qty * it.rate;
      const comp = computeTax(lineAmount, it.tax);
      await client.query(
        `INSERT INTO sales_items
          (tenant_id, sales_id, line_no, description, qty, rate, net_amount, tax_amount, total_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          tenantId, salesId, lineNo++,
          it.description, it.qty, it.rate,
          Number(comp.net.toFixed(2)), Number(comp.tax.toFixed(2)), Number(comp.gross.toFixed(2)),
        ]
      );
    }

    // Journal posting: Debit AR/Bank/Cash or split by payments, Credit Sales and Tax Payable
    const lines = [];
    const salesIncomeAccountId = payload.sales_account_id; // required mapping from frontend/config
    const taxPayableAccountId = payload.tax_account_id;    // required mapping from frontend/config
    if (!salesIncomeAccountId || !taxPayableAccountId) {
      throw new Error('sales_account_id and tax_account_id required');
    }

    // Credits
    if (totalNet > 0) lines.push({ account_id: salesIncomeAccountId, type: 'credit', amount: Number(totalNet.toFixed(2)) });
    if (totalTax > 0) lines.push({ account_id: taxPayableAccountId, type: 'credit', amount: Number(totalTax.toFixed(2)) });

    // Debits - multi-payment supported
    if (payload.payments && payload.payments.length) {
      for (const pay of payload.payments) {
        // method is informational; we use account_id to post
        if (!pay.account_id) throw new Error('payment account_id required');
        lines.push({ account_id: pay.account_id, type: 'debit', amount: Number(Number(pay.amount || 0).toFixed(2)) });
      }
    } else {
      // If no payment, debit Accounts Receivable
      if (!payload.receivable_account_id) throw new Error('receivable_account_id required when no payments');
      lines.push({ account_id: payload.receivable_account_id, type: 'debit', amount: Number(totalGross.toFixed(2)) });
    }

    const journal = await postJournal(tenantId, client, {
      date: payload.date || new Date().toISOString().slice(0, 10),
      narration: payload.narration || `Sales ${receiptNo}`,
      lines,
      source_table: 'sales',
      source_id: salesId,
      voucher_prefix: 'VCHR',
    });

    await client.query(
      `UPDATE sales SET voucher_no = $1 WHERE id = $2 AND tenant_id = $3`,
      [journal.voucherNo, salesId, tenantId]
    );

    await client.query('COMMIT');

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'sales',
      entityId: salesId,
      action: 'create',
      details: { receipt_no: receiptNo, voucher_no: journal.voucherNo },
    });

    // Return sales with totals and receipt
    const { rows: sale } = await pgQuery(
      `SELECT s.*, 
              (SELECT COALESCE(JSON_AGG(si ORDER BY line_no), '[]'::json) FROM sales_items si WHERE si.tenant_id=s.tenant_id AND si.sales_id=s.id) as items
         FROM sales s
        WHERE s.tenant_id=$1 AND s.id=$2`,
      [tenantId, salesId]
    );
    return sale[0] || null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * recordExpense
 * Records an expense entry with categorization and posting.
 * Payload: { date, vendor_id, lines:[{category_id, description, amount, tax}], payments:[{account_id, amount}], narration }
 */
async function recordExpense(tenantId, user, payload) {
  /** Creates vendor expense with tax and payment/AR posting. */
  if (!payload || !Array.isArray(payload.lines) || payload.lines.length === 0) throw new Error('lines required');

  let totalNet = 0;
  let totalTax = 0;
  let totalGross = 0;
  for (const ln of payload.lines) {
    const amt = Number(ln.amount || 0);
    const comp = computeTax(amt, ln.tax || { ratePercent: 0, inclusive: false });
    totalNet += comp.net;
    totalTax += comp.tax;
    totalGross += comp.gross;
  }
  if (payload.payments && payload.payments.length) {
    validatePayments(totalGross, payload.payments);
  }

  const client = await pgGetClient();
  try {
    await client.query('BEGIN');
    const seq = await nextSequential(tenantId, 'EXP', client);
    const voucher = `EXP-${String(seq).padStart(6, '0')}`;

    const { rows: expRows } = await client.query(
      `INSERT INTO expenses
        (tenant_id, date, vendor_id, expense_no, net_amount, tax_amount, total_amount, narration, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING id`,
      [
        tenantId,
        payload.date || new Date().toISOString().slice(0, 10),
        payload.vendor_id || null,
        voucher,
        Number(totalNet.toFixed(2)),
        Number(totalTax.toFixed(2)),
        Number(totalGross.toFixed(2)),
        payload.narration || null,
        user?.id || null,
      ]
    );
    const expenseId = expRows[0].id;

    let lineNo = 1;
    for (const ln of payload.lines) {
      const comp = computeTax(Number(ln.amount || 0), ln.tax || { ratePercent: 0, inclusive: false });
      await client.query(
        `INSERT INTO expense_lines
          (tenant_id, expense_id, line_no, category_id, description, net_amount, tax_amount, total_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId,
          expenseId,
          lineNo++,
          ln.category_id || null,
          ln.description || null,
          Number(comp.net.toFixed(2)),
          Number(comp.tax.toFixed(2)),
          Number(comp.gross.toFixed(2)),
        ]
      );
    }

    if (!payload.expense_account_id || !payload.tax_input_account_id) {
      throw new Error('expense_account_id and tax_input_account_id required');
    }
    const lines = [];
    // Debits
    if (totalNet > 0) lines.push({ account_id: payload.expense_account_id, type: 'debit', amount: Number(totalNet.toFixed(2)) });
    if (totalTax > 0) lines.push({ account_id: payload.tax_input_account_id, type: 'debit', amount: Number(totalTax.toFixed(2)) });
    // Credits
    if (payload.payments && payload.payments.length) {
      for (const p of payload.payments) {
        if (!p.account_id) throw new Error('payment account_id required');
        lines.push({ account_id: p.account_id, type: 'credit', amount: Number(Number(p.amount || 0).toFixed(2)) });
      }
    } else {
      if (!payload.payable_account_id) throw new Error('payable_account_id required when no payments');
      lines.push({ account_id: payload.payable_account_id, type: 'credit', amount: Number(totalGross.toFixed(2)) });
    }

    const journal = await postJournal(tenantId, client, {
      date: payload.date || new Date().toISOString().slice(0, 10),
      narration: payload.narration || `Expense ${voucher}`,
      lines,
      source_table: 'expenses',
      source_id: expenseId,
      voucher_prefix: 'VCHR',
    });

    await client.query(
      `UPDATE expenses SET voucher_no = $1 WHERE id = $2 AND tenant_id = $3`,
      [journal.voucherNo, expenseId, tenantId]
    );

    await client.query('COMMIT');

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'expense',
      entityId: expenseId,
      action: 'create',
      details: { expense_no: voucher, voucher_no: journal.voucherNo },
    });

    const { rows } = await pgQuery(
      `SELECT e.*,
              (SELECT COALESCE(JSON_AGG(el ORDER BY line_no), '[]'::json) FROM expense_lines el WHERE el.tenant_id=e.tenant_id AND el.expense_id=e.id) as lines
         FROM expenses e
        WHERE e.tenant_id=$1 AND e.id=$2`,
      [tenantId, expenseId]
    );
    return rows[0] || null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * recordPettyCash
 * Manages petty cash expenses and top-ups.
 * Payload: { date, type: 'topup'|'expense', account_id, amount, description }
 */
async function recordPettyCash(tenantId, user, payload) {
  /** Records petty cash topups and expenses and posts journal lines. */
  if (!payload || !payload.type || !payload.account_id || !payload.amount) throw new Error('type, account_id, amount required');

  const client = await pgGetClient();
  try {
    await client.query('BEGIN');

    const seq = await nextSequential(tenantId, 'PETTY', client);
    const refNo = `PET-${String(seq).padStart(6, '0')}`;

    const { rows: hdr } = await client.query(
      `INSERT INTO petty_cash (tenant_id, date, ref_no, type, account_id, amount, description, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [
        tenantId,
        payload.date || new Date().toISOString().slice(0, 10),
        refNo,
        payload.type,
        payload.account_id,
        Number(payload.amount),
        payload.description || null,
        user?.id || null,
      ]
    );
    const pettyId = hdr[0].id;

    let lines;
    if (payload.type === 'topup') {
      // Debit petty cash account, credit funding account
      if (!payload.funding_account_id) throw new Error('funding_account_id required for topup');
      lines = [
        { account_id: payload.account_id, type: 'debit', amount: Number(payload.amount) },
        { account_id: payload.funding_account_id, type: 'credit', amount: Number(payload.amount) },
      ];
    } else if (payload.type === 'expense') {
      if (!payload.expense_account_id) throw new Error('expense_account_id required for expense');
      lines = [
        { account_id: payload.expense_account_id, type: 'debit', amount: Number(payload.amount) },
        { account_id: payload.account_id, type: 'credit', amount: Number(payload.amount) },
      ];
    } else {
      throw new Error('invalid petty cash type');
    }

    const journal = await postJournal(tenantId, client, {
      date: payload.date || new Date().toISOString().slice(0, 10),
      narration: payload.description || `Petty cash ${refNo}`,
      lines,
      source_table: 'petty_cash',
      source_id: pettyId,
      voucher_prefix: 'VCHR',
    });

    await client.query(`UPDATE petty_cash SET voucher_no=$1 WHERE id=$2 AND tenant_id=$3`, [journal.voucherNo, pettyId, tenantId]);

    await client.query('COMMIT');

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'petty_cash',
      entityId: pettyId,
      action: 'create',
      details: { ref_no: refNo, voucher_no: journal.voucherNo },
    });

    const { rows } = await pgQuery(`SELECT * FROM petty_cash WHERE tenant_id=$1 AND id=$2`, [tenantId, pettyId]);
    return rows[0] || null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * bulkSales
 * Accepts array of sales payloads and records them atomically.
 */
async function bulkSales(tenantId, user, salesArray = []) {
  /** Bulk-create sales; rolls back entire batch on failure. */
  if (!Array.isArray(salesArray) || !salesArray.length) throw new Error('sales array required');
  const client = await pgGetClient();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const s of salesArray) {
      // Use per-iteration inner TX logic calling helpers operating on same client isn't trivial.
      // For bulk, reimplement critical pieces with shared client:
      if (!s || !Array.isArray(s.items) || !s.items.length) throw new Error('items required in sale');
      // Compute totals
      let totalNet = 0; let totalTax = 0; let totalGross = 0;
      for (const it of s.items) {
        const comp = computeTax(Number(it.qty || 1) * Number(it.rate || 0), it.tax || { ratePercent: 0, inclusive: false });
        totalNet += comp.net; totalTax += comp.tax; totalGross += comp.gross;
      }
      if (s.payments && s.payments.length) validatePayments(totalGross, s.payments);

      const seq = await nextSequential(tenantId, 'SALES', client);
      const receiptNo = `RCPT-${String(seq).padStart(6, '0')}`;

      const { rows: hdr } = await client.query(
        `INSERT INTO sales (tenant_id, date, customer_id, receipt_no, net_amount, tax_amount, total_amount, narration, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
        [
          tenantId,
          s.date || new Date().toISOString().slice(0, 10),
          s.customer_id || null,
          receiptNo,
          Number(totalNet.toFixed(2)),
          Number(totalTax.toFixed(2)),
          Number(totalGross.toFixed(2)),
          s.narration || null,
          user?.id || null,
        ]
      );
      const salesId = hdr[0].id;

      let lineNo = 1;
      for (const it of s.items) {
        const comp = computeTax(Number(it.qty || 1) * Number(it.rate || 0), it.tax || { ratePercent: 0, inclusive: false });
        await client.query(
          `INSERT INTO sales_items
            (tenant_id, sales_id, line_no, description, qty, rate, net_amount, tax_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            tenantId, salesId, lineNo++,
            it.description || 'Item', Number(it.qty || 1), Number(it.rate || 0),
            Number(comp.net.toFixed(2)), Number(comp.tax.toFixed(2)), Number(comp.gross.toFixed(2)),
          ]
        );
      }

      // Journal
      if (!s.sales_account_id || !s.tax_account_id) throw new Error('sales_account_id and tax_account_id required');
      const lines = [];
      if (totalNet > 0) lines.push({ account_id: s.sales_account_id, type: 'credit', amount: Number(totalNet.toFixed(2)) });
      if (totalTax > 0) lines.push({ account_id: s.tax_account_id, type: 'credit', amount: Number(totalTax.toFixed(2)) });
      if (s.payments && s.payments.length) {
        for (const p of s.payments) {
          if (!p.account_id) throw new Error('payment account_id required');
          lines.push({ account_id: p.account_id, type: 'debit', amount: Number(Number(p.amount || 0).toFixed(2)) });
        }
      } else {
        if (!s.receivable_account_id) throw new Error('receivable_account_id required when no payments');
        lines.push({ account_id: s.receivable_account_id, type: 'debit', amount: Number(totalGross.toFixed(2)) });
      }

      const journal = await postJournal(tenantId, client, {
        date: s.date || new Date().toISOString().slice(0, 10),
        narration: s.narration || `Sales ${receiptNo}`,
        lines,
        source_table: 'sales',
        source_id: salesId,
        voucher_prefix: 'VCHR',
      });

      await client.query(`UPDATE sales SET voucher_no=$1 WHERE tenant_id=$2 AND id=$3`, [journal.voucherNo, tenantId, salesId]);

      results.push({ sales_id: salesId, receipt_no: receiptNo, voucher_no: journal.voucherNo });
    }
    await client.query('COMMIT');

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'sales',
      entityId: null,
      action: 'bulk_create',
      details: { count: results.length },
    });

    return { success: true, results };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * bulkExpenses
 * Accepts array of expense payloads and records them atomically.
 */
async function bulkExpenses(tenantId, user, expensesArray = []) {
  /** Bulk-create expenses; rolls back entire batch on failure. */
  if (!Array.isArray(expensesArray) || !expensesArray.length) throw new Error('expenses array required');
  const client = await pgGetClient();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const s of expensesArray) {
      if (!s || !Array.isArray(s.lines) || !s.lines.length) throw new Error('lines required');
      let totalNet = 0; let totalTax = 0; let totalGross = 0;
      for (const ln of s.lines) {
        const comp = computeTax(Number(ln.amount || 0), ln.tax || { ratePercent: 0, inclusive: false });
        totalNet += comp.net; totalTax += comp.tax; totalGross += comp.gross;
      }
      if (s.payments && s.payments.length) validatePayments(totalGross, s.payments);

      const seq = await nextSequential(tenantId, 'EXP', client);
      const expNo = `EXP-${String(seq).padStart(6, '0')}`;

      const { rows: hdr } = await client.query(
        `INSERT INTO expenses
          (tenant_id, date, vendor_id, expense_no, net_amount, tax_amount, total_amount, narration, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
        [
          tenantId,
          s.date || new Date().toISOString().slice(0, 10),
          s.vendor_id || null,
          expNo,
          Number(totalNet.toFixed(2)),
          Number(totalTax.toFixed(2)),
          Number(totalGross.toFixed(2)),
          s.narration || null,
          user?.id || null,
        ]
      );
      const expenseId = hdr[0].id;

      let lineNo = 1;
      for (const ln of s.lines) {
        const comp = computeTax(Number(ln.amount || 0), ln.tax || { ratePercent: 0, inclusive: false });
        await client.query(
          `INSERT INTO expense_lines
            (tenant_id, expense_id, line_no, category_id, description, net_amount, tax_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            tenantId, expenseId, lineNo++,
            ln.category_id || null, ln.description || null,
            Number(comp.net.toFixed(2)), Number(comp.tax.toFixed(2)), Number(comp.gross.toFixed(2)),
          ]
        );
      }

      if (!s.expense_account_id || !s.tax_input_account_id) throw new Error('expense_account_id and tax_input_account_id required');
      const lines = [];
      if (totalNet > 0) lines.push({ account_id: s.expense_account_id, type: 'debit', amount: Number(totalNet.toFixed(2)) });
      if (totalTax > 0) lines.push({ account_id: s.tax_input_account_id, type: 'debit', amount: Number(totalTax.toFixed(2)) });
      if (s.payments && s.payments.length) {
        for (const p of s.payments) {
          if (!p.account_id) throw new Error('payment account_id required');
          lines.push({ account_id: p.account_id, type: 'credit', amount: Number(Number(p.amount || 0).toFixed(2)) });
        }
      } else {
        if (!s.payable_account_id) throw new Error('payable_account_id required when no payments');
        lines.push({ account_id: s.payable_account_id, type: 'credit', amount: Number(totalGross.toFixed(2)) });
      }

      const journal = await postJournal(tenantId, client, {
        date: s.date || new Date().toISOString().slice(0, 10),
        narration: s.narration || `Expense ${expNo}`,
        lines,
        source_table: 'expenses',
        source_id: expenseId,
        voucher_prefix: 'VCHR',
      });

      await client.query(`UPDATE expenses SET voucher_no=$1 WHERE tenant_id=$2 AND id=$3`, [journal.voucherNo, tenantId, expenseId]);
      results.push({ expense_id: expenseId, expense_no: expNo, voucher_no: journal.voucherNo });
    }
    await client.query('COMMIT');

    await logAudit({
      tenantId,
      userId: user?.id,
      entityType: 'expense',
      entityId: null,
      action: 'bulk_create',
      details: { count: results.length },
    });

    return { success: true, results };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * validateTransaction
 * Perform basic validation on a transaction payload.
 */
function validateTransaction(payload) {
  /** Validates transaction common requirements. */
  if (!payload) throw new Error('payload required');
  if (payload.items && !Array.isArray(payload.items)) throw new Error('items must be an array');
  if (payload.lines && !Array.isArray(payload.lines)) throw new Error('lines must be an array');
  return true;
}

module.exports = {
  // PUBLIC_INTERFACE
  recordSales,
  // PUBLIC_INTERFACE
  recordExpense,
  // PUBLIC_INTERFACE
  recordPettyCash,
  // PUBLIC_INTERFACE
  bulkSales,
  // PUBLIC_INTERFACE
  bulkExpenses,
  // PUBLIC_INTERFACE
  getRealtimeBalances,
  // PUBLIC_INTERFACE
  validateTransaction,
  // PUBLIC_INTERFACE
  nextSequential,
};
