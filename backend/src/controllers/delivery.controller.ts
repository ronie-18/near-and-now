import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { runDeliverySimulation } from '../services/deliverySimulation.service.js';

export class DeliveryController {
  /** Start mock delivery simulation (driver follows road routes). Runs in background. */
  async startSimulation(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        return res.status(400).json({ error: 'Order ID required' });
      }
      res.status(202).json({ status: 'simulation_started', orderId });
      runDeliverySimulation(orderId).catch((err) =>
        console.error('Delivery simulation error:', err)
      );
    } catch (error) {
      console.error('Error starting simulation:', error);
      res.status(500).json({ error: 'Failed to start simulation' });
    }
  }
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

  // Get single delivery partner by ID
  async getDeliveryPartnerById(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const partner = await databaseService.getDeliveryPartnerById(partnerId);
      if (!partner) {
        return res.status(404).json({ error: 'Delivery partner not found' });
      }
      res.json(partner);
    } catch (error) {
      console.error('Error fetching delivery partner:', error);
      res.status(500).json({ error: 'Failed to fetch delivery partner' });
    }
  }

  // Create new delivery partner
  async createDeliveryPartner(req: Request, res: Response) {
    try {
      const partner = await databaseService.createDeliveryPartner(req.body);
      res.status(201).json(partner);
    } catch (error) {
      console.error('Error creating delivery partner:', error);
      res.status(500).json({ error: 'Failed to create delivery partner' });
    }
  }

  // Update delivery partner
  async updateDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.updateDeliveryPartner(partnerId, req.body);
      res.json(result);
    } catch (error) {
      console.error('Error updating delivery partner:', error);
      res.status(500).json({ error: 'Failed to update delivery partner' });
    }
  }

  // Delete delivery partner
  async deleteDeliveryPartner(req: Request, res: Response) {
    try {
      const { partnerId } = req.params;
      const result = await databaseService.deleteDeliveryPartner(partnerId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting delivery partner:', error);
      res.status(500).json({ error: 'Failed to delete delivery partner' });
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
