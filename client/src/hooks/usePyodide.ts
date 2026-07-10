/**
 * usePyodide hook — manages Pyodide loading state and exposes run/reset functions.
 * Design: Dark IDE Aesthetic (PyCalc Live)
 */
import { useState, useCallback, useRef } from 'react';
import {
  loadPyodide,
  initPyodideEnv,
  executeCode,
  executeCodeFresh,
  ExecResult,
} from '@/lib/pyodideEngine';

export type PyodideStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export function usePyodide() {
  const [status, setStatus] = useState<PyodideStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<ExecResult | null>(null);
  const initRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;
    setStatus('loading');
    try {
      await loadPyodide();
      await initPyodideEnv();
      setStatus('ready');
    } catch (e: any) {
      setLoadError(String(e));
      setStatus('error');
      initRef.current = false;
    }
  }, []);

  const run = useCallback(async (source: string) => {
    if (status === 'loading') return;
    if (status === 'idle') await initialize();
    setStatus('running');
    try {
      const res = await executeCode(source);
      setResult(res);
    } finally {
      setStatus('ready');
    }
  }, [status, initialize]);

  const runFresh = useCallback(async (source: string) => {
    if (status === 'loading') return;
    if (status === 'idle') await initialize();
    setStatus('running');
    try {
      const res = await executeCodeFresh(source);
      setResult(res);
    } finally {
      setStatus('ready');
    }
  }, [status, initialize]);

  return { status, loadError, result, initialize, run, runFresh };
}
