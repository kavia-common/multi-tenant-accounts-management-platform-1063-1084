'use strict';
const accountingService = require('../services/accounting');

/**
 * PUBLIC_INTERFACE
 * AccountingController
 * Handles HTTP for daily operations: sales, expenses, petty cash, bulk entry, balances, and validations.
 */
class AccountingController {
  /**
   * Create a sales entry with auto-journals and optional multi-payment.
   * Request body should include items, accounts mapping, and optional payments.
   */
  async createSales(req, res) {
    try {
      const result = await accountingService.recordSales(req.tenantId, req.user, req.body || {});
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * Bulk create sales in a single transaction.
   * Body: { sales: [<sales payloads>] }
   */
  async bulkSales(req, res) {
    try {
      const { sales } = req.body || {};
      if (!Array.isArray(sales) || !sales.length) return res.status(400).json({ message: 'sales array required' });
      const result = await accountingService.bulkSales(req.tenantId, req.user, sales);
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * Create an expense with categorization and posting; supports multi-payment.
   */
  async createExpense(req, res) {
    try {
      const result = await accountingService.recordExpense(req.tenantId, req.user, req.body || {});
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * Bulk create expenses.
   */
  async bulkExpenses(req, res) {
    try {
      const { expenses } = req.body || {};
      if (!Array.isArray(expenses) || !expenses.length) return res.status(400).json({ message: 'expenses array required' });
      const result = await accountingService.bulkExpenses(req.tenantId, req.user, expenses);
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * Petty cash top-ups and expenses.
   */
  async pettyCash(req, res) {
    try {
      const result = await accountingService.recordPettyCash(req.tenantId, req.user, req.body || {});
      return res.status(201).json(result);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }

  /**
   * Validate a transaction payload without posting.
   */
  async validate(req, res) {
    try {
      accountingService.validateTransaction(req.body || {});
      return res.json({ valid: true });
    } catch (e) {
      return res.status(400).json({ valid: false, message: e.message });
    }
  }

  /**
   * Real-time balances for accounts.
   */
  async balances(req, res) {
    try {
      const account_ids = req.body?.account_ids || req.query?.account_ids;
      const ids = Array.isArray(account_ids)
        ? account_ids.map((v) => parseInt(v, 10)).filter((v) => !isNaN(v))
        : (typeof account_ids === 'string' ? account_ids.split(',').map((s) => parseInt(s.trim(), 10)).filter((v) => !isNaN(v)) : []);
      const result = await accountingService.getRealtimeBalances(req.tenantId, { account_ids: ids });
      return res.json({ data: result });
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new AccountingController();
