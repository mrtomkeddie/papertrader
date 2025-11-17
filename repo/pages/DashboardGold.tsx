import React from 'react';
import DashboardBase from '../ui/DashboardBase';

export default function DashboardGold() {
  // Show Gold fixed strategy: Fixed ORB + FVG + LVN
  return <DashboardBase title="Gold" strategyFilter={["fixed-orb-fvg-lvn"]} />;
}