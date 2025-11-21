const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pledgeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'pledge_id',
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'campaign_id',
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'),
      defaultValue: 'PENDING',
      allowNull: false,
    },
    gatewayTransactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'gateway_transaction_id',
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'idempotency_key',
    },
    webhookEvents: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  }, {
    tableName: 'payments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['pledge_id'] },
      { fields: ['campaign_id'] },
      { fields: ['idempotency_key'], unique: true },
      { fields: ['gateway_transaction_id'] },
      { fields: ['status'] },
    ],
  });

  return Payment;
};
