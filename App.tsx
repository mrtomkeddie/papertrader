
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
import { auth } from './services/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initDb } from './services/database';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { collection, onSnapshot, QuerySnapshot } from 'firebase/firestore';
import { db } from './services/database';
import { toast } from 'react-toastify';
import { Explanation } from './types';
import { ListIcon as MenuIcon } from './components/icons/Icons';

const App: React.FC = () => {
  // Read feature flags from Vite env
  const ENABLE_SCANNER_UI = (import.meta.env.VITE_ENABLE_SCANNER_UI === '1' || import.meta.env.VITE_ENABLE_SCANNER_UI === 'true');
  const [isAuthed, setIsAuthed] = useState<boolean>(!!auth.currentUser);
  const [authError, setAuthError] = useState<string | null>(null);
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      const code = e?.code || 'unknown';
      let msg = 'Google sign-in failed.';
      if (code === 'auth/unauthorized-domain') {
        msg += ' Add this domain to Firebase Authentication authorized domains.';
      } else if (code === 'auth/popup-blocked') {
        msg += ' Popup was blocked by the browser; allow popups or try again.';
      } else if (code === 'auth/popup-closed-by-user') {
        msg += ' Popup closed before completing sign-in.';
      }
      setAuthError(`${msg} (${code})`);
      console.error('[auth] Sign-in error:', e);
    }
  };

  return (
    <HashRouter>
      {/* If not authenticated, show a simple login gate */}
      {!isAuthed ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-gray-200">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg text-center">
            <h2 className="text-lg sm:text-xl font-semibold mb-3 text-primary-light">Sign in to continue</h2>
            <p className="text-gray-400 mb-5">Use your Google account to access your data.</p>
            <button
              onClick={handleGoogleSignIn}
              className="px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
            >
              Sign in with Google
            </button>
            {authError && (
              <div className="mt-4 text-red-400 text-sm">
                {authError}
              </div>
            )}
          </div>
        </div>
      ) : (
        // Original app content when authenticated
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 text-gray-200 font-sans">
          {isMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-40 md:hidden" 
              onClick={() => setIsMenuOpen(false)}
            />
          )}
          <aside 
            className={`fixed top-0 left-0 h-screen w-64 bg-gray-800/80 backdrop-blur-sm border-r border-white/10 p-4 flex flex-col transform transition-transform duration-300 ease-in-out z-50 md:translate-x-0 md:w-64 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="mb-8 flex items-center justify-between">
              <img src="/ptlogo.png" alt="Paper Trader logo" className="h-8 w-auto" />
              <button className="md:hidden text-gray-300 p-2" onClick={() => setIsMenuOpen(false)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col space-y-2">
              <NavItem to="/" icon={<DashboardIcon />} onClick={() => setIsMenuOpen(false)}>Dashboard</NavItem>
              {ENABLE_SCANNER_UI && (
                <NavItem to="/scanner" icon={<ScannerIcon />} onClick={() => setIsMenuOpen(false)}>Market Scanner</NavItem>
              )}
              <NavItem to="/trades" icon={<ListIcon />} onClick={() => setIsMenuOpen(false)}>Trades</NavItem>
              <NavItem to="/strategies" icon={<StrategyIcon />} onClick={() => setIsMenuOpen(false)}>Strategies</NavItem>
              <NavItem to="/analytics" icon={<AnalyticsIcon />} onClick={() => setIsMenuOpen(false)}>Analytics</NavItem>
              <NavItem to="/settings" icon={<SettingsIcon />} onClick={() => setIsMenuOpen(false)}>Settings</NavItem>
            </nav>
          </aside>
          <header className="fixed top-0 left-0 right-0 h-16 bg-gray-800/80 backdrop-blur-sm flex items-center justify-between px-4 z-30 md:hidden">
            <button onClick={() => setIsMenuOpen(true)}>
              <MenuIcon />
            </button>
            <img src="/ptlogo.png" alt="Paper Trader logo" className="h-8 w-auto" />
            <div className="w-6" /> {/* Spacer for symmetry */}
          </header>
          <main className="pt-16 md:pt-0 ml-0 md:ml-64 p-4 md:p-6 h-screen overflow-y-auto">
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
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, children, onClick }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={`flex items-center space-x-3 p-2 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors justify-start ${isActive ? "bg-primary/20 text-primary-light ring-1 ring-primary/30" : ""}`}
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
};

export default App;