const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Pledge = sequelize.define('Pledge', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'campaign_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0.01,
      },
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'CAPTURED', 'COMPLETED', 'FAILED', 'CANCELLED'),
      defaultValue: 'PENDING',
      allowNull: false,
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'idempotency_key',
    },
    paymentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'payment_id',
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  }, {
    tableName: 'pledges',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['campaign_id'] },
      { fields: ['user_id'] },
      { fields: ['idempotency_key'], unique: true },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  });

  return Pledge;
};
