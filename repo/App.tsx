
import React, { useEffect, useState, Suspense } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import DashboardOverview from './pages/DashboardOverview';
import DashboardGold from './pages/DashboardGold';
import DashboardNas100 from './pages/DashboardNas100';
const Trades = React.lazy(() => import('./pages/Trades'));
const PositionDetail = React.lazy(() => import('./pages/PositionDetail'));
const Settings = React.lazy(() => import('./pages/Settings'));
import { DashboardIcon, ListIcon, SettingsIcon } from './components/icons/Icons';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initDb } from './services/database';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { collection, onSnapshot, QuerySnapshot } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { Explanation } from './types';
import { ListIcon as MenuIcon } from './components/icons/Icons';

const App: React.FC = () => {
  const [isAuthed, setIsAuthed] = useState<boolean>(!!auth?.currentUser);
  const setupMissing = !auth;
  const [authError, setAuthError] = useState<string | null>(null);
  // Render-state debug to track which branch is active
  try {
    console.log('[render] App', { setupMissing, isAuthed, user: auth?.currentUser?.uid ?? null });
  } catch {}
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAuthed(!!user);
      if (user) {
        initDb().catch(err => console.error('Failed to initialize database:', err));
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isAuthed || !db) return;
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
  }, [isAuthed]);

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
      {setupMissing ? (
        <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
          <div className="card-premium p-6 rounded-xl shadow-lg max-w-lg">
            <h2 className="text-xl font-semibold mb-3 text-primary-light">Setup Required</h2>
            <p className="text-gray-300 mb-4">Firebase is not configured. Add the following keys to <code className="bg-black/30 px-1 py-0.5 rounded">repo/.env.local</code>:</p>
            <ul className="text-gray-300 text-sm space-y-1 mb-4 list-disc list-inside">
              <li><code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_API_KEY</code></li>
              <li><code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_AUTH_DOMAIN</code></li>
              <li><code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_PROJECT_ID</code></li>
              <li className="text-gray-400">Optional: <code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_STORAGE_BUCKET</code>, <code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_MESSAGING_SENDER_ID</code>, <code className="bg-black/30 px-1 py-0.5 rounded">VITE_FIREBASE_APP_ID</code></li>
            </ul>
            <div className="bg-black/30 rounded p-3 text-sm text-gray-300">
              <p className="font-semibold mb-2">Detected (non-sensitive):</p>
              <ul className="space-y-1">
                <li>API Key present: {String(Boolean((import.meta as any).env?.VITE_FIREBASE_API_KEY))}</li>
                <li>Auth Domain present: {String(Boolean((import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN))}</li>
                <li>Project ID present: {String(Boolean((import.meta as any).env?.VITE_FIREBASE_PROJECT_ID))}</li>
              </ul>
            </div>
            <p className="text-gray-400 text-sm">After updating, restart the dev server.</p>
          </div>
        </div>
      ) : !isAuthed ? (
        <div className="min-h-screen flex items-center justify-center bg-black text-gray-200">
          <div className="card-premium p-6 rounded-xl shadow-lg text-center">
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
        <div className="min-h-screen bg-app-base text-gray-200 font-sans">
          {isMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-[90] md:hidden" 
              onClick={() => setIsMenuOpen(false)}
            />
          )}
          <aside 
            className={`fixed top-0 left-0 h-screen w-64 sidebar-premium backdrop-blur-sm p-4 flex flex-col transform transition-transform duration-300 ease-in-out z-[100] md:translate-x-0 md:w-64 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="mb-8 flex items-center justify-between">
              <img src="/ptlogo.png" alt="Paper Trader logo" className="h-8 w-auto mt-2 ml-2" />
              <button className="md:hidden text-gray-300 p-2" onClick={() => setIsMenuOpen(false)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col space-y-2">
              <NavItem to="/dashboard/overview" icon={<DashboardIcon />} onClick={() => setIsMenuOpen(false)}>Dashboard</NavItem>
              <NavItem to="/trades" icon={<ListIcon />} onClick={() => setIsMenuOpen(false)}>Trades</NavItem>
              <NavItem to="/settings" icon={<SettingsIcon />} onClick={() => setIsMenuOpen(false)}>Settings</NavItem>
            </nav>
          </aside>
          <header className="fixed top-0 left-0 right-0 h-16 header-premium backdrop-blur-sm flex items-center justify-between px-4 z-30 md:hidden">
            <button onClick={() => setIsMenuOpen(true)}>
              <MenuIcon />
            </button>
            <img src="/ptlogo.png" alt="Paper Trader logo" className="h-8 w-auto" />
            <div className="w-6" />
          </header>
          <main className="pt-20 md:pt-6 ml-0 md:ml-64 p-4 md:p-6 h-screen overflow-y-auto">
            <ToastContainer aria-label="Notifications" position="top-right" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="dark" />
            <div className="page-container">
              <Suspense fallback={<div className="text-gray-300">Loading…</div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
                  <Route path="/dashboard/overview" element={<DashboardOverview />} />
                  <Route path="/dashboard/gold" element={<DashboardGold />} />
                  <Route path="/dashboard/nas100" element={<DashboardNas100 />} />
                  <Route path="/trades" element={<Trades />} />
                  <Route path="/positions/:id" element={<PositionDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/dashboard/overview" replace />} />
                </Routes>
              </Suspense>
            </div>
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
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center space-x-3 p-2 rounded-lg text-gray-300 hover:bg-[rgba(16,185,129,0.05)] hover:text-accent-green transition-colors justify-start ${isActive ? 'nav-active border border-white/25 rounded-full' : ''}`
      }
    >
      <span className="w-8 h-8 flex items-center justify-center icon-chip">
        {icon}
      </span>
      <span>{children}</span>
    </NavLink>
  );
};

export default App;