import React from 'react';
import DashboardBase from '../ui/DashboardBase';

export default function DashboardNas100() {
  // Show NAS100 fixed strategy: Fixed ORB + FVG + LVN
  return <DashboardBase title="NAS100" strategyFilter={["fixed-orb-fvg-lvn"]} />;
}