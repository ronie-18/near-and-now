import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class DeliveryController {
  // Get all delivery partners
  async getDeliveryPartners(req: Request, res: Response) {
    try {
      const partners = await databaseService.getDeliveryPartners();
      res.json(partners);
    } catch (error) {
      console.error('Error fetching delivery partners:', error);
      res.status(500).json({ error: 'Failed to fetch delivery partners' });
    }
  }

  // Get delivery agents for a partner
  async getDeliveryAgents(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const agents = await databaseService.getDeliveryAgents(partnerId);
      res.json(agents);
    } catch (error) {
      console.error('Error fetching delivery agents:', error);
      res.status(500).json({ error: 'Failed to fetch delivery agents' });
    }
  }

  // Assign delivery agent to order
  async assignDeliveryAgent(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { agentId, partnerId } = req.body;

      if (!agentId || !partnerId) {
        return res.status(400).json({ error: 'Agent ID and Partner ID are required' });
      }

      const result = await databaseService.assignDeliveryAgent(orderId, agentId, partnerId);
      res.json(result);
    } catch (error) {
      console.error('Error assigning delivery agent:', error);
      res.status(500).json({ error: 'Failed to assign delivery agent' });
    }
  }

  // Get delivery schedule for an agent
  async getAgentSchedule(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { date } = req.query;

      const schedule = await databaseService.getAgentSchedule(agentId, date as string);
      res.json(schedule);
    } catch (error) {
      console.error('Error fetching agent schedule:', error);
      res.status(500).json({ error: 'Failed to fetch agent schedule' });
    }
  }

  // Update delivery status
  async updateDeliveryStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status, location, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const result = await databaseService.updateDeliveryStatus(orderId, {
        status,
        location,
        notes
      });

      res.json(result);
    } catch (error) {
      console.error('Error updating delivery status:', error);
      res.status(500).json({ error: 'Failed to update delivery status' });
    }
  }
}
