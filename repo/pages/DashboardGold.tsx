import React from 'react';
import DashboardBase from '../ui/DashboardBase';

export default function DashboardGold() {
  return <DashboardBase title="Gold" strategyFilter={["trendAtr_xau"]} />;
}