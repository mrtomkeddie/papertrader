
import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import PositionDetail from './pages/PositionDetail';
import Strategies from './pages/Strategies';
import Settings from './pages/Settings';
import Scanner from './pages/Scanner';
import Analytics from './pages/Analytics';
import { DashboardIcon, ListIcon, StrategyIcon, SettingsIcon, ScannerIcon, AnalyticsIcon } from './components/icons/Icons';
import { auth, signInWithGoogle } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { initDb } from './services/database';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { collection, onSnapshot, QuerySnapshot } from 'firebase/firestore';
import { db } from './services/database';
import { toast } from 'react-toastify';
import { Explanation } from './types';

const App: React.FC = () => {
  // Read feature flags from Vite env
  const ENABLE_SCANNER_UI = (import.meta.env.VITE_ENABLE_SCANNER_UI === '1' || import.meta.env.VITE_ENABLE_SCANNER_UI === 'true');

  const [isAuthed, setIsAuthed] = useState<boolean>(!!auth.currentUser);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthed(!!user);
      if (user) {
        // Seed Firestore after authenticated sign-in
        initDb().catch(err => console.error('Failed to initialize database:', err));
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const explanationsCollection = collection(db, 'explanations');
    let isInitial = true;
    const unsubscribe = onSnapshot(explanationsCollection, (snapshot: QuerySnapshot) => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const explanation = change.doc.data() as Explanation;
          toast.info(`New Trade: ${explanation.plain_english_entry}`);
        }
        if (change.type === 'modified') {
          const explanation = change.doc.data() as Explanation;
          if (explanation.exit_reason) {
            toast.info(`Trade Closed: ${explanation.exit_reason}`);
          }
          if (explanation.failure_analysis) {
            toast.warn(`Failure Analysis: ${explanation.failure_analysis}`);
          }
        }
      });
    });
    return () => unsubscribe();
  }, []);

  // Removed periodic price check interval to eliminate background overhead

  return (
    <HashRouter>
      {/* If not authenticated, show a simple login gate */}
      {!isAuthed ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-gray-200">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg text-center">
            <h2 className="text-lg sm:text-xl font-semibold mb-3 text-primary-light">Sign in to continue</h2>
            <p className="text-gray-400 mb-5">Use your Google account to access your data.</p>
            <button
              onClick={() => signInWithGoogle()}
              className="px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      ) : (
        // Original app content when authenticated
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-gray-200 font-sans">
          <aside className="fixed top-0 left-0 h-screen w-20 md:w-64 bg-gray-800/80 backdrop-blur-sm border-r border-white/10 p-2 md:p-4 flex flex-col">
            <img src="/fav.svg" alt="Paper Trader icon" className="h-8 w-8 mb-6 mx-auto md:hidden" />
            <div className="mb-8 hidden md:flex items-center justify-center">
              <img src="/ptlogo.png" alt="Paper Trader logo" className="h-12 w-auto" />
            </div>
            <nav className="flex flex-col space-y-2">
              <NavItem to="/" icon={<DashboardIcon />}>Dashboard</NavItem>
              {/* Conditionally show Market Scanner */}
              {ENABLE_SCANNER_UI && (
                <NavItem to="/scanner" icon={<ScannerIcon />}>Market Scanner</NavItem>
              )}
              <NavItem to="/trades" icon={<ListIcon />}>Trades</NavItem>
              <NavItem to="/strategies" icon={<StrategyIcon />}>Strategies</NavItem>
              <NavItem to="/analytics" icon={<AnalyticsIcon />}>Analytics</NavItem>
              <NavItem to="/settings" icon={<SettingsIcon />}>Settings</NavItem>
            </nav>
          </aside>
          <main className="ml-20 md:ml-64 p-4 md:p-6 h-screen overflow-y-auto">
            <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="dark" />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              {/* Conditionally register Scanner route */}
              {ENABLE_SCANNER_UI && (
                <Route path="/scanner" element={<Scanner />} />
              )}
              <Route path="/trades" element={<Trades />} />
              <Route path="/positions/:id" element={<PositionDetail />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </main>
        </div>
      )}
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