
import React from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import PositionDetail from './pages/PositionDetail';
import Strategies from './pages/Strategies';
import Settings from './pages/Settings';
import Scanner from './pages/Scanner';
import { DashboardIcon, ListIcon, StrategyIcon, SettingsIcon, ScannerIcon } from './components/icons/Icons'; 

const App: React.FC = () => {
  // Read feature flags from Vite env
  const ENABLE_SCANNER_UI = (import.meta.env.VITE_ENABLE_SCANNER_UI === '1' || import.meta.env.VITE_ENABLE_SCANNER_UI === 'true');

  // Removed periodic price check interval to eliminate background overhead

  return (
    <HashRouter>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-gray-200 font-sans">
        <aside className="fixed top-0 left-0 h-screen md:w-64 w-20 bg-gray-800/80 backdrop-blur-sm border-r border-white/10 p-4 flex flex-col">
          <h1 className="text-2xl font-bold text-primary-light mb-8 hidden md:block">Paper Trader</h1>
          <nav className="flex flex-col space-y-2">
            <NavItem to="/" icon={<DashboardIcon />}>Dashboard</NavItem>
            {/* Conditionally show Market Scanner */}
            {ENABLE_SCANNER_UI && (
              <NavItem to="/scanner" icon={<ScannerIcon />}>Market Scanner</NavItem>
            )}
            <NavItem to="/trades" icon={<ListIcon />}>Trades</NavItem>
            <NavItem to="/strategies" icon={<StrategyIcon />}>Strategies</NavItem>
            <NavItem to="/settings" icon={<SettingsIcon />}>Settings</NavItem>
          </nav>
        </aside>
        <main className="md:ml-64 ml-20 md:p-6 p-4 h-screen overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            {/* Conditionally register Scanner route */}
            {ENABLE_SCANNER_UI && (
              <Route path="/scanner" element={<Scanner />} />
            )}
            <Route path="/trades" element={<Trades />} />
            <Route path="/positions/:id" element={<PositionDetail />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <NavLink
      to={to}
      className={`flex items-center space-x-3 p-2 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors justify-center md:justify-start ${isActive ? 'bg-primary/20 text-primary-light ring-1 ring-primary/30' : ''}`}
    >
      {icon}
      <span className="hidden md:inline">{children}</span>
    </NavLink>
  );
};

export default App;