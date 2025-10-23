import React, { useState, useEffect } from 'react';
import * as db from '../services/database'; // Now uses Firestore-backed functions
import { WEBHOOK_KEY, PINE_SCRIPT_ALERT_MESSAGE } from '../constants';
import { handleWebhook, runPriceCheck } from '../services/tradingService';
import { TradingViewPayload, Strategy, Signal, Position, Explanation, LedgerEntry, StopLogic } from '../types';
import { collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db as firestoreDb } from '../services/firebase';
// Add auth imports
import { auth, signInWithGoogle, signOutUser } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
    <div className="space-y-8 max-w-4xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold text-white">Settings</h2>

      {/* Account & Security */}
      <div className="bg-gray-800 p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg">
        <h3 className="text-lg sm:text-xl font-semibold mb-2 text-primary-light">Account & Security</h3>
        <p className="text-gray-400 mb-4">
          You are {userInfo?.isAnonymous ? 'signed in anonymously' : 'signed in'}.
          {userInfo && (
            <span className="ml-1">UID: <code className="text-gray-300">{userInfo.uid}</code></span>
          )}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => signInWithGoogle()}
            className="px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-center leading-tight"
          >
            Sign in with Google
          </button>
          <button
            onClick={() => signOutUser()}
            className="px-4 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition text-center leading-tight"
          >
            Sign out
          </button>
        </div>

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
            className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-center leading-tight"
          >
            Export All Data
          </button>
          <label className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition cursor-pointer inline-flex items-center text-center leading-tight">
            <span>Import Data</span>
            <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
          </label>
          <button
            onClick={handleClearData}
            className="px-4 py-3 bg-red-700 text-white rounded-md hover:bg-red-800 transition text-center leading-tight"
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
        <form onSubmit={handleTestWebhook}>
            <textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={8}
                className="w-full bg-gray-900 p-3 rounded-md text-sm text-gray-300 font-mono focus:ring-primary focus:border-primary border border-gray-600"
            />
            <button type="submit" className="mt-4 px-4 py-3 bg-primary-dark text-white rounded-md hover:bg-primary-darker transition text-center leading-tight">
                Send Test Alert
            </button>
        </form>
      </div>
      
      {response && (
            <div className={`mt-4 p-3 rounded-md text-sm ${response.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                {response.message}
            </div>
        )}
    </div>
  );
};

export default Settings;