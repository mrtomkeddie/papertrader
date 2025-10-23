
import React from 'react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative';
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, change, changeType }) => {
  const changeColor = changeType === 'positive' ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-gray-800/80 border border-white/10 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-xl">
      <h3 className="text-[11px] sm:text-xs font-medium text-gray-400 tracking-wide">{title}</h3>
      <div className="mt-2 sm:mt-3 flex items-baseline">
        <p className="text-xl sm:text-3xl font-semibold text-white">{value}</p>
        {change && (
          <p className={`ml-2 flex items-baseline text-xs sm:text-sm font-semibold ${changeColor}`}>
            {change}
          </p>
        )}
      </div>
    </div>
  );
};

export default DashboardCard;
