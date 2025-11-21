const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Campaign = sequelize.define('Campaign', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    goalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'goal_amount',
    },
    organizerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organizer_id',
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date',
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'),
      defaultValue: 'DRAFT',
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'image_url',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  }, {
    tableName: 'campaigns',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['organizer_id'] },
      { fields: ['category'] },
      { fields: ['created_at'] },
    ],
  });

  return Campaign;
};
