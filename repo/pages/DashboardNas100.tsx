import React from 'react';
import DashboardBase from '../ui/DashboardBase';

export default function DashboardNas100() {
  return <DashboardBase title="NAS100" strategyFilter={["orb", "trendAtr_nas", "vwapReversion"]} />;
}