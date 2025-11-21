const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CampaignTotals = sequelize.define('CampaignTotals', {
    campaignId: {
      type: DataTypes.UUID,
      primaryKey: true,
      field: 'campaign_id',
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      allowNull: false,
      field: 'total_amount',
    },
    totalPledges: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'total_pledges',
    },
    completedPledges: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'completed_pledges',
    },
    lastUpdated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'last_updated',
    },
  }, {
    tableName: 'campaign_totals',
    timestamps: true,
    underscored: true,
  });

  return CampaignTotals;
};
