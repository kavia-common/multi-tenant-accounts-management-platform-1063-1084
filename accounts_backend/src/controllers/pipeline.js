'use strict';
const pipelineService = require('../services/pipeline');

/**
 * PUBLIC_INTERFACE
 * PipelineController
 * Handles HTTP for sales pipeline: stages, deals (incl. Kanban), activities, analytics, email workflows, scheduling.
 */
class PipelineController {
  // Stages
  async createStage(req, res) {
    try {
      const result = await pipelineService.createStage(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async listStages(req, res) {
    try {
      const rows = await pipelineService.listStages(req.tenantId);
      res.json({ data: rows });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async updateStage(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.updateStage(req.tenantId, req.user, id, req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async deleteStage(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.deleteStage(req.tenantId, req.user, id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async reorderStages(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { position } = req.body || {};
      if (!position) return res.status(400).json({ message: 'position required' });
      const result = await pipelineService.reorderStages(req.tenantId, req.user, id, parseInt(position, 10));
      res.json({ data: result });
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Deals
  async createDeal(req, res) {
    try {
      const result = await pipelineService.createDeal(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async getDeal(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const deal = await pipelineService.getDeal(req.tenantId, id);
      if (!deal) return res.status(404).json({ message: 'Not found' });
      res.json(deal);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async listDeals(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10) || 25, 1), 200);
      const filters = {
        stage_id: req.query.stage_id,
        status: req.query.status,
        owner_user_id: req.query.owner_user_id,
        q: req.query.q,
      };
      const result = await pipelineService.listDeals(req.tenantId, filters, page, limit);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async updateDeal(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.updateDeal(req.tenantId, req.user, id, req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async deleteDeal(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.deleteDeal(req.tenantId, req.user, id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async moveDeal(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { stage_id, position } = req.body || {};
      if (!stage_id || !position) return res.status(400).json({ message: 'stage_id and position required' });
      const result = await pipelineService.moveDeal(req.tenantId, req.user, id, parseInt(stage_id, 10), parseInt(position, 10));
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Activities
  async addActivity(req, res) {
    try {
      const result = await pipelineService.addActivity(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async listActivities(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
      const filters = {
        deal_id: req.query.deal_id,
        type: req.query.type,
        status: req.query.status,
        created_by: req.query.created_by,
        due_from: req.query.due_from,
        due_to: req.query.due_to,
      };
      const result = await pipelineService.listActivities(req.tenantId, filters, page, limit);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async updateActivity(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.updateActivity(req.tenantId, req.user, id, req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async deleteActivity(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.deleteActivity(req.tenantId, req.user, id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Analytics
  async forecast(req, res) {
    try {
      const result = await pipelineService.forecast(req.tenantId, req.query || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async funnel(req, res) {
    try {
      const result = await pipelineService.funnelAnalytics(req.tenantId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async conversions(req, res) {
    try {
      const result = await pipelineService.conversionTracking(req.tenantId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Lead scoring and routing
  async leadScore(req, res) {
    try {
      const contactId = parseInt(req.params.contactId, 10);
      const result = await pipelineService.leadScore(req.tenantId, contactId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async autoAssignLead(req, res) {
    try {
      const contactId = parseInt(req.params.contactId, 10);
      const result = await pipelineService.autoAssignLead(req.tenantId, contactId);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Email management
  async createEmailTemplate(req, res) {
    try {
      const result = await pipelineService.createEmailTemplate(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async listEmailTemplates(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
      const result = await pipelineService.listEmailTemplates(req.tenantId, page, limit);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async updateEmailTemplate(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.updateEmailTemplate(req.tenantId, req.user, id, req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async deleteEmailTemplate(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await pipelineService.deleteEmailTemplate(req.tenantId, req.user, id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async createEmailSequence(req, res) {
    try {
      const result = await pipelineService.createEmailSequence(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async sendEmail(req, res) {
    try {
      const result = await pipelineService.basicSendEmail(req.tenantId, req.user, req.body || {});
      res.status(202).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  // Scheduling
  async schedule(req, res) {
    try {
      const result = await pipelineService.scheduleAppointment(req.tenantId, req.user, req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
  async listAppointments(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
      const filters = {
        from: req.query.from,
        to: req.query.to,
        organizer_user_id: req.query.organizer_user_id,
      };
      const result = await pipelineService.listAppointments(req.tenantId, filters, page, limit);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }
}

module.exports = new PipelineController();
