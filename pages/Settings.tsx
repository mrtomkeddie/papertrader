import React, { useState, useEffect } from 'react';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { WEBHOOK_KEY, PINE_SCRIPT_ALERT_MESSAGE } from '../constants';
import { handleWebhook, runPriceCheck } from '../services/tradingService';
import { TradingViewPayload, Strategy, Signal, Position, Explanation, LedgerEntry, StopLogic } from '../types';
import { collection, getDocs, doc, deleteDoc, writeBatch, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db as firestoreDb } from '../services/firebase';
// Add auth imports
import { auth, signInWithGoogle, signOutUser } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useDatabase } from '../hooks/useDatabase';
import { SchedulerActivity } from '../types';

const Settings: React.FC = () => {
  const [response, setResponse] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [testPayload, setTestPayload] = useState(JSON.stringify({
    signal: "LONG",
    symbol: "AAPL",
    bar_time: Date.now(),
    close: 175.50,
    atr: 1.25
  }, null, 2));
  const webhookUrl = `${window.location.origin}${window.location.pathname}#/?webhook_key=${WEBHOOK_KEY}`;

  // Auth state
  const [userInfo, setUserInfo] = useState<{ uid: string; isAnonymous: boolean; providers: string[] } | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'default' | 'loading'>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { data: schedulerActivity, loading: schedulerLoading, error: schedulerError } = useDatabase<SchedulerActivity>('scheduler', 'activity');
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserInfo({ uid: user.uid, isAnonymous: user.isAnonymous, providers: (user.providerData || []).map(p => p.providerId) });
      } else {
        setUserInfo(null);
      }
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const messaging = getMessaging();
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
    });
    return () => unsubscribe();
  }, []);

  // Ensure the test symbol has an active strategy
  const ensureActiveStrategyForSymbol = async (symbol: string): Promise<string | undefined> => {
    const strategies = await db.getStrategies();
    const existing = strategies.find(s => s.symbol === symbol);
    if (existing) {
      if (!existing.enabled) {
        await db.updateStrategy({ ...existing, enabled: true });
      }
      return existing.id;
    }
    const created = await db.addStrategy({
      name: `${symbol} Test Strategy`,
      symbol,
      timeframe: '5m',
      risk_per_trade_gbp: 5,
      stop_logic: StopLogic.ATR,
      atr_mult: 1.5,
      take_profit_R: 2,
      slippage_bps: 10,
      fee_bps: 0,
      enabled: true,
    });
    return created.id;
  };

  // Fix: Make handleExportData async and await DB calls
  const handleExportData = async () => {
    try {
      const allData: {
        strategies: Strategy[],
        signals: Signal[],
        positions: Position[],
        explanations: Explanation[],
        ledger: LedgerEntry[],
      } = {
        strategies: await db.getStrategies(),
        signals: await db.getSignals(),
        positions: await db.getPositions(),
        explanations: await db.getExplanations(),
        ledger: await db.getLedger(),
      };
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(allData, null, 2))}`;
      const link = document.createElement('a');
      link.href = jsonString;
      link.download = `paper-trader-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setResponse({ message: 'Data exported successfully.', type: 'success' });
    } catch (err) {
      setResponse({ message: `Failed to export data: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => { // Make async
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Are you sure you want to import this file? This will overwrite ALL existing data.")) {
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => { // Make onload async
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("File content is not readable text.");
        
        const data = JSON.parse(text);
        if (data.strategies && data.positions && data.ledger && data.signals && data.explanations) {
          // Clear existing data in Firestore
          const collections = ['strategies', 'signals', 'positions', 'explanations', 'ledger'];
          for (const colName of collections) {
            const querySnapshot = await getDocs(collection(firestoreDb, colName));
            const batch = writeBatch(firestoreDb);
            querySnapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          // Import new data
          // Fix: Omit 'id' property from imported objects before adding to ensure `addDoc` generates new IDs
          for (const strategy of data.strategies) {
            const { id, ...strategyWithoutId } = strategy;
            await db.addStrategy(strategyWithoutId);
          }
          for (const signal of data.signals) {
            const { id, ...signalWithoutId } = signal;
            await db.addSignal(signalWithoutId);
          }
          for (const position of data.positions) {
            const { id, ...positionWithoutId } = position;
            await db.addPosition(positionWithoutId);
          }
          for (const explanation of data.explanations) {
            const { id, ...explanationWithoutId } = explanation;
            await db.addExplanation(explanationWithoutId);
          }
          // Ledger entries need to be added sequentially to correctly calculate cash_after
          for (const entry of data.ledger) { 
            // When re-adding ledger, cash_after will be recalculated by addLedgerEntry
            // Fix: Omit 'id' property from imported ledger entry before adding
            const { id, ...entryWithoutId } = entry;
            await db.addLedgerEntry({ts: entryWithoutId.ts, delta_gbp: entryWithoutId.delta_gbp, cash_after: 0, ref_type: entryWithoutId.ref_type, ref_id: entryWithoutId.ref_id }); 
          }

          setResponse({ message: 'Data imported successfully. The app will now reload.', type: 'success' });
          setTimeout(() => window.location.reload(), 2000);
        } else {
          throw new Error("Invalid data file. Missing required keys (strategies, positions, signals, explanations, ledger).");
        }
      } catch (err) {
        setResponse({ message: `Failed to import data: ${err instanceof Error ? err.message : String(err)}`, type: 'error'});
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleClearData = async () => { // Make async
    if (window.confirm("ARE YOU SURE you want to delete all trading data? This action cannot be undone.")) {
      try {
        const collections = ['strategies', 'signals', 'positions', 'explanations', 'ledger'];
        for (const colName of collections) {
          const querySnapshot = await getDocs(collection(firestoreDb, colName));
          const batch = writeBatch(firestoreDb);
          querySnapshot.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        setResponse({ message: 'All data has been cleared. The app will now reload.', type: 'success' });
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        setResponse({ message: `Failed to clear data: ${err instanceof Error ? err.message : String(err)}`, type: 'error'});
      }
    }
  };

  // Clear trades only: positions, signals, explanations, ledger (keep strategies intact)
  const handleClearTradesOnly = async () => {
    if (window.confirm("Delete ALL trades, signals, explanations, and ledger entries? Strategies will be kept.")) {
      try {
        const collections = ['signals', 'positions', 'explanations', 'ledger'];
        for (const colName of collections) {
          const querySnapshot = await getDocs(collection(firestoreDb, colName));
          const batch = writeBatch(firestoreDb);
          querySnapshot.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        setResponse({ message: 'All trades have been cleared. The app will now reload.', type: 'success' });
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setResponse({ message: `Failed to clear trades: ${err instanceof Error ? err.message : String(err)}`, type: 'error'});
      }
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Ensure strategies exist before testing (prevents race with startup seeding)
      await db.initDb();

      const parsed: TradingViewPayload = JSON.parse(testPayload);
      // Always use a fresh bar_time to avoid duplicate signal idempotency
      const payload: TradingViewPayload = { ...parsed, bar_time: Date.now() };

      // Ensure there is an active strategy for the test symbol
      await ensureActiveStrategyForSymbol(payload.symbol);

      const result = await handleWebhook(payload);
      if(result.success) {
        setResponse({ message: result.message, type: 'success'});
      } else {
        setResponse({ message: result.message, type: 'error'});
      }
    } catch (err) {
      setResponse({ message: `Invalid JSON payload: ${err instanceof Error ? err.message : String(err)}`, type: 'error'});
    }
  };
  
  const handleRunPriceCheck = async () => {
      await runPriceCheck();
      setResponse({ message: "Manual price check job executed.", type: 'success'});
  }
  const requestNotificationPermission = async () => {
    setNotificationStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission);
      if (permission === 'granted') {
        const messaging = getMessaging();
        // Use the PWA service worker registration so Firebase Messaging can subscribe
        const registration = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        if (token) {
          setFcmToken(token);
          const uid = auth.currentUser?.uid;
          if (uid) {
            const userRef = doc(firestoreDb, 'users', uid);
            await setDoc(userRef, { fcmToken: token }, { merge: true });
          } else {
            console.warn('[push] No signed-in user; skipping Firestore token save.');
          }
          setResponse({ message: 'Push notifications enabled.', type: 'success' });
        } else {
          setResponse({ message: 'No FCM token returned. Check VAPID key and service worker.', type: 'error' });
        }
      } else {
        setResponse({ message: 'Notification permission denied.', type: 'error' });
      }
    } catch (error) {
      console.error('Error getting notification permission:', error);
      setNotificationStatus('default');
      setResponse({ message: 'Failed to enable push notifications.', type: 'error' });
    }
  };

  // Auto-run webhook test when visiting Settings with ?autotest=1
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const paramsStr = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(paramsStr);
      if (params.get('autotest') === '1') {
        (async () => {
          try {
            await db.initDb();
            const parsed: TradingViewPayload = JSON.parse(testPayload);
            const payload: TradingViewPayload = { ...parsed, bar_time: Date.now() };

            // Ensure there is an active strategy for the test symbol
            await ensureActiveStrategyForSymbol(payload.symbol);

            const result = await handleWebhook(payload);
            setResponse({ message: result.message, type: result.success ? 'success' : 'error' });
          } catch (err) {
            setResponse({ message: `Invalid JSON payload: ${err instanceof Error ? err.message : String(err)}`, type: 'error' });
          }
        })();
      }
    } catch (e) {
      // Ignore parsing errors silently
    }
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-3xl font-bold text-white">Settings</h2>

      {/* Account & Security */}
      <div className="bg-gray-800 p-2 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-base sm:text-xl font-semibold mb-2 text-primary-light">Account & Security</h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4">
          You are {userInfo?.isAnonymous ? 'signed in anonymously' : 'signed in'}.
          {userInfo && (
            <span className="ml-1">UID: <code className="text-gray-300">{userInfo.uid}</code></span>
          )}
        </p>
        <div className="flex flex-wrap gap-3 sm:gap-4">
          <button
            onClick={() => signInWithGoogle()}
            className="px-3 sm:px-4 py-2 sm:py-3 bg-accent text-white rounded-md hover:bg-accent-light transition text-center leading-tight"
          >
            Sign in with Google
          </button>
          <button
            onClick={() => signOutUser()}
            className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition text-center leading-tight"
          >
            Sign out
          </button>
        </div>

      </div>

      {/* Push Notifications */}
      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Push Notifications</h3>
        <p className="text-gray-400 mb-4">
          Enable push notifications to receive alerts for trades on your mobile device.
        </p>
        <button
          onClick={requestNotificationPermission}
          disabled={notificationStatus === 'loading' || notificationStatus === 'granted'}
          className="px-3 sm:px-4 py-2 sm:py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50 text-center leading-tight"
        >
          {notificationStatus === 'loading' ? 'Enabling...' : notificationStatus === 'granted' ? 'Enabled' : 'Enable Push Notifications'}
        </button>
        {fcmToken && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-gray-400">Your FCM Device Token:</p>
            <div className="bg-gray-900 p-3 rounded-md">
              <code className="text-xs break-all text-gray-300">{fcmToken}</code>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(fcmToken)}
              className="px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition text-center leading-tight"
            >
              Copy Token
            </button>
          </div>
        )}
      </div>

      {/* Scheduler Status */}
      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Scheduler Status</h3>
        {schedulerLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : schedulerError ? (
          <p className="text-red-300">Failed to load scheduler: {schedulerError}</p>
        ) : schedulerActivity ? (
          <div className="space-y-3 text-sm text-gray-300">
            <p>Last run: <span className="font-mono">{new Date(schedulerActivity.last_run_ts).toLocaleString()}</span></p>
            <p>Session: <span className="font-mono capitalize">{schedulerActivity.window}</span></p>
            <p>Opportunities found: <span className="font-mono">{schedulerActivity.ops_found}</span></p>
            <p>Trades placed: <span className="font-mono">{schedulerActivity.trades_placed}</span></p>
            <div>
              <p className="text-sm text-gray-400 mb-2">Universe</p>
              <div className="flex flex-wrap gap-2">
                {(schedulerActivity.universe_symbols || []).map(s => (
                  <span key={s} className="px-2 py-1 rounded-md bg-gray-700 text-gray-200 text-xs ring-1 ring-white/10">{s}</span>
                ))}
              </div>
            </div>
            {schedulerActivity.messages && schedulerActivity.messages.length > 0 && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Messages</p>
                <ul className="list-disc pl-5 space-y-1">
                  {schedulerActivity.messages.map((m, i) => (
                    <li key={i} className="text-gray-300">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400">No scheduler activity yet.</p>
        )}
      </div>

      {/* Data Management */}
      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Data Management</h3>
        <p className="text-gray-400 mb-4">
          Export your trading data for backup, or import a previous backup. You can also clear all data to start fresh.
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExportData}
            className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-center leading-tight"
          >
            Export All Data
          </button>
          <label className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition cursor-pointer inline-flex items-center text-center leading-tight">
            <span>Import Data</span>
            <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
          </label>
          <button
            onClick={handleClearTradesOnly}
            className="w-full sm:w-auto px-4 py-3 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition text-center leading-tight"
          >
            Clear Trades Only
          </button>
          <button
            onClick={handleClearData}
            className="w-full sm:w-auto px-4 py-3 bg-red-700 text-white rounded-md hover:bg-red-800 transition text-center leading-tight"
          >
            Clear All Data
          </button>
        </div>
      </div>

      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Your Webhook URL</h3>
        <p className="text-gray-400 mb-4">
          This application simulates a backend endpoint. For a real application, you would post to a server.
          For this simulation, use the "Test Webhook" form in the Manual Controls section.
        </p>
        <div className="bg-gray-900 p-3 rounded-md">
          <code className="text-sm text-gray-300 break-all">{webhookUrl}</code>
        </div>
      </div>
      
      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">TradingView Alert Message</h3>
        <p className="text-gray-400 mb-4">
          Copy and paste this JSON into the "Message" box for your alerts in TradingView.
          Ensure your chart has an ATR indicator plotted for the ATR value to work.
        </p>
        <pre className="bg-gray-900 p-3 sm:p-4 rounded-md text-sm text-gray-300 overflow-x-auto">
          <code>{`${PINE_SCRIPT_ALERT_MESSAGE}`}</code>
        </pre>
      </div>

       <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Manual Controls</h3>
        <div className="flex space-x-3 sm:space-x-4">
            <button
              onClick={handleRunPriceCheck}
              className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-center leading-tight"
            >
              Run Price Check Job
            </button>
        </div>
        
        <h4 className="text-base sm:text-lg font-semibold mt-6 mb-2">Test Webhook</h4>
        <form onSubmit={handleTestWebhook} className="space-y-3 sm:space-y-4">
            <textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={8}
                className="w-full h-32 sm:h-40 bg-gray-900 text-white p-2 sm:p-3 rounded-md font-mono text-xs sm:text-sm"
            />
            <button type="submit" className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-center leading-tight">
                Send Test Alert
            </button>
        </form>
      </div>
      
      {response && (
            <div className={`mt-4 p-3 rounded-md text-sm ${response.type === 'success' ? 'bg-accent/20 text-accent' : 'bg-red-900 text-red-200'}`}>
                {response.message}
            </div>
        )}
    </div>
  );
};

export default Settings;