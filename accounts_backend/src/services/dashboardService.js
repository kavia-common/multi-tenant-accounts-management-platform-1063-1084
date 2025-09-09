'use strict';

const db = require('../config/db');

/**
 * PUBLIC_INTERFACE
 * Return dashboard data scoped to tenant and tailored by role.
 */
async function getDashboard(tenant_id, role) {
  /** Query sample KPIs per tenant. */
  // Example queries: counts of users, recent audit logs count, etc.
  const [{ rows: usersCount }] = await Promise.all([
    db.query('SELECT COUNT(*) AS users FROM users WHERE tenant_id = ?', [tenant_id]),
  ]);

  const base = {
    tenant_id,
    widgets: [
      { key: 'users', value: usersCount[0]?.users || 0, label: 'Users' },
    ],
  };

  if (['manager', 'admin'].includes(String(role).toLowerCase())) {
    base.widgets.push({ key: 'revenue', value: 125000, label: 'Revenue (mock)' });
    base.widgets.push({ key: 'pipeline', value: 47, label: 'Open Deals (mock)' });
  } else if (String(role).toLowerCase() === 'sales_rep') {
    base.widgets.push({ key: 'my_deals', value: 12, label: 'My Deals (mock)' });
  } else {
    base.widgets.push({ key: 'announcements', value: 3, label: 'Announcements (mock)' });
  }

  return base;
}

module.exports = {
  getDashboard,
};
