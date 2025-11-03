import React from 'react';

interface LogsPanelProps {
  logs: string[];
}

const LogsPanel: React.FC<LogsPanelProps> = ({ logs }) => {
  const last20 = logs.slice(-20);
  return (
    <div className="card-premium p-4 rounded-lg shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-3">Scheduler Logs</h3>
      <ul className="space-y-2 text-sm text-gray-300">
        {last20.map((m, idx) => (
          <li key={idx} className="bg-black/40 p-2 rounded">{m}</li>
        ))}
        {last20.length === 0 && (
          <li className="text-gray-400">No logs found for this filter.</li>
        )}
      </ul>
    </div>
  );
};

export default LogsPanel;