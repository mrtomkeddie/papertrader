import React from 'react';
import DashboardBase from '../ui/DashboardBase';

export default function DashboardGold() {
  // Show Gold strategies: ORB, Trend Pullback (ATR), VWAP Reversion
  return <DashboardBase title="Gold" strategyFilter={["orb", "trendAtr_xau", "vwapReversion"]} />;
}