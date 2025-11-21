const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Outbox = sequelize.define('Outbox', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    aggregateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'aggregate_id',
    },
    aggregateType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'aggregate_type',
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
    published: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'retry_count',
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
  }, {
    tableName: 'outbox',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['published'] },
      { fields: ['aggregate_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  });

  return Outbox;
};
