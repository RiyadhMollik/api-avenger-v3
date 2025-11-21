const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WebhookLog = sequelize.define('WebhookLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    paymentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'payment_id',
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'idempotency_key',
    },
    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'event_type',
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    processed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
    isDuplicate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_duplicate',
    },
  }, {
    tableName: 'webhook_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['idempotency_key'] },
      { fields: ['payment_id'] },
      { fields: ['event_type'] },
      { fields: ['processed'] },
    ],
  });

  return WebhookLog;
};
