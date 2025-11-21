const { Sequelize } = require('sequelize');
const createPledgeModel = require('../models/Pledge');
const createOutboxModel = require('../models/Outbox');
const StateMachine = require('../utils/stateMachine');

class PledgeService {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;
    this.Pledge = createPledgeModel(sequelize);
    this.Outbox = createOutboxModel(sequelize);
  }

  async createPledge(pledgeData) {
    const { campaignId, userId, amount, idempotencyKey, metadata = {} } = pledgeData;

    // Check idempotency
    const existingPledge = await this.Pledge.findOne({
      where: { idempotencyKey },
    });

    if (existingPledge) {
      this.logger.info('Duplicate pledge request detected', { idempotencyKey });
      return existingPledge;
    }

    // Start transaction for outbox pattern
    const transaction = await this.sequelize.transaction();

    try {
      // 1. Create pledge record
      const pledge = await this.Pledge.create({
        campaignId,
        userId,
        amount,
        idempotencyKey,
        status: 'PENDING',
        metadata,
      }, { transaction });

      // 2. Create outbox event (same transaction)
      await this.Outbox.create({
        aggregateId: pledge.id,
        aggregateType: 'Pledge',
        eventType: 'PledgeCreated',
        payload: {
          pledgeId: pledge.id,
          campaignId: pledge.campaignId,
          userId: pledge.userId,
          amount: pledge.amount,
          status: pledge.status,
          createdAt: pledge.createdAt,
        },
        published: false,
      }, { transaction });

      // 3. Commit transaction - both writes succeed or both fail
      await transaction.commit();

      this.logger.info('Pledge created with outbox event', {
        pledgeId: pledge.id,
        campaignId,
        amount,
      });

      return pledge;
    } catch (error) {
      await transaction.rollback();
      this.logger.error('Failed to create pledge', error);
      throw error;
    }
  }

  async updatePledgeStatus(pledgeId, newStatus, metadata = {}) {
    const transaction = await this.sequelize.transaction();

    try {
      const pledge = await this.Pledge.findByPk(pledgeId, { transaction });

      if (!pledge) {
        throw new Error('Pledge not found');
      }

      // Validate state transition
      StateMachine.validateTransition(pledge.status, newStatus);

      const oldStatus = pledge.status;
      pledge.status = newStatus;
      pledge.metadata = { ...pledge.metadata, ...metadata };
      await pledge.save({ transaction });

      // Create outbox event for status change
      await this.Outbox.create({
        aggregateId: pledge.id,
        aggregateType: 'Pledge',
        eventType: 'PledgeStatusChanged',
        payload: {
          pledgeId: pledge.id,
          campaignId: pledge.campaignId,
          oldStatus,
          newStatus,
          amount: pledge.amount,
          updatedAt: new Date(),
        },
        published: false,
      }, { transaction });

      // If pledge is completed, emit completion event
      if (newStatus === 'COMPLETED') {
        await this.Outbox.create({
          aggregateId: pledge.id,
          aggregateType: 'Pledge',
          eventType: 'PledgeCompleted',
          payload: {
            pledgeId: pledge.id,
            campaignId: pledge.campaignId,
            userId: pledge.userId,
            amount: pledge.amount,
            completedAt: new Date(),
          },
          published: false,
        }, { transaction });
      }

      await transaction.commit();

      this.logger.info('Pledge status updated', {
        pledgeId,
        oldStatus,
        newStatus,
      });

      return pledge;
    } catch (error) {
      await transaction.rollback();
      this.logger.error('Failed to update pledge status', error);
      throw error;
    }
  }

  async getPledgeById(pledgeId) {
    return await this.Pledge.findByPk(pledgeId);
  }

  async getPledgesByCampaign(campaignId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    return await this.Pledge.findAndCountAll({
      where: { campaignId },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
  }

  async getPledgesByUser(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    return await this.Pledge.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
  }

  async getDonationHistory(userId) {
    return await this.Pledge.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }
}

module.exports = PledgeService;
