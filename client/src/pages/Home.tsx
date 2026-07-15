/**
 * Home — PyCalc Live 主界面
 * 布局：顶部工具栏 + 三栏（代码编辑器 | 结果面板 | 变量/包侧边栏）
 * Design: Light IDE Aesthetic — GitHub Light inspired
 *
 * 特性：
 * - Pyodide WebAssembly Python 引擎（浏览器内运行，无需服务器）
 * - 逐行自动输出结果（含赋值语句，MATLAB 风格），与代码行高严格对齐（22px）
 * - 变量侧边栏实时显示命名空间
 * - 包面板：选中包后自动前置 import，不污染用户代码
 * - 一键全量重算（重置环境后重新执行）
 * - 代码自动保存到 localStorage
 * - Shift+Enter 运行，Ctrl+Enter 全量重算
 * - 双向 hover 视觉引导：悬停代码行 ↔ 高亮对应输出行
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import CodeEditor, { CodeEditorHandle } from '@/components/CodeEditor';
import ResultPanel from '@/components/ResultPanel';
import VariablePanel from '@/components/VariablePanel';
import PackagePanel from '@/components/PackagePanel';
import { usePyodide } from '@/hooks/usePyodide';
import { LineResult, VarInfo, PackageInfo } from '@/lib/pyodideEngine';
import { PYODIDE_PACKAGES } from '@/lib/pyodideEngine';
import {
  Play,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
  Save,
  Package,
} from 'lucide-react';

const STORAGE_KEY = 'pycalc-live-code';

const DEFAULT_CODE = `# PyCalc Live — 交互式 Python 计算器
# 按 Shift+Enter 运行，Ctrl+Enter 全量重算

import math
import matplotlib.pyplot as plt
import numpy as np

# 基础计算
x = 42
y = 3.14
a = math.sqrt(x + y)

# 列表推导式
nums = [i**2 for i in range(1, 6)]

# 绘图示例
t = np.linspace(0, 2 * np.pi, 200)
plt.figure(figsize=(5, 2.5))
plt.plot(t, np.sin(t), label="sin(t)")
plt.plot(t, np.cos(t), label="cos(t)", linestyle="--")
plt.title("sin & cos")
plt.legend()
plt.tight_layout()
plt.show()
`;

function loadSavedCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CODE;
  } catch {
    return DEFAULT_CODE;
  }
}

function saveCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

export default function Home() {
  const editorRef = useRef<CodeEditorHandle>(null);
  const { status, loadError, result, initialize, run, runFresh } = usePyodide();

  const [scrollTop, setScrollTop] = useState(0);
  const [lineCount, setLineCount] = useState(() => loadSavedCode().split('\n').length);
  // Fix: load initial code once and freeze it — never re-read from localStorage during renders
  const [initialCode] = useState(() => loadSavedCode());
  const [lineResults, setLineResults] = useState<LineResult[]>([]);
  const [variables, setVariables] = useState<VarInfo[]>([]);
  // Right panel: 'var' | 'pkg' | null — mutually exclusive
  const [rightPanel, setRightPanel] = useState<'var' | 'pkg' | null>('var');
  // Default-select math, matplotlib, numpy to match the default example code
  const [selectedPackages, setSelectedPackages] = useState<Map<string, PackageInfo>>(() => {
    const defaults = ['math', 'matplotlib', 'numpy'];
    const m = new Map<string, PackageInfo>();
    for (const name of defaults) {
      const pkg = PYODIDE_PACKAGES.find((p) => p.name === name);
      if (pkg) m.set(name, pkg);
    }
    return m;
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const execStartRef = useRef<number>(0);

  // Update results when execution completes
  useEffect(() => {
    if (result) {
      setLineResults(result.lineResults);
      setVariables(result.variables);
      if (execStartRef.current) {
        setExecTime(Date.now() - execStartRef.current);
      }
      if (result.globalError) {
        toast.error('执行错误', { description: result.globalError });
      }
    }
  }, [result]);

  // Auto-initialize Pyodide on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-save code to localStorage every 2 seconds after change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCodeChange = useCallback((code: string) => {
    const lc = code.split('\n').length;
    setLineCount(lc);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveCode(code);
      setLastSaved(new Date());
    }, 2000);
  }, []);

  // Build hidden import prelude from selected packages
  const buildPrelude = useCallback((): string => {
    if (selectedPackages.size === 0) return '';
    const lines: string[] = [];
    for (const pkg of Array.from(selectedPackages.values())) {
      if (pkg.importAs) lines.push(pkg.importAs);
    }
    return lines.join('\n') + '\n';
  }, [selectedPackages]);

  const handleRun = useCallback(async (code: string) => {
    if (status === 'loading') { toast.info('Python 引擎加载中，请稍候…'); return; }
    const lc = editorRef.current?.getLineCount() ?? code.split('\n').length;
    setLineCount(lc);
    execStartRef.current = Date.now();
    const prelude = buildPrelude();
    // Execute prelude separately so user code line numbers stay correct
    await run(code, prelude);
  }, [status, run, buildPrelude]);

  const handleRunFresh = useCallback(async (code: string) => {
    if (status === 'loading') { toast.info('Python 引擎加载中，请稍候…'); return; }
    const lc = editorRef.current?.getLineCount() ?? code.split('\n').length;
    setLineCount(lc);
    setLineResults([]);
    setVariables([]);
    execStartRef.current = Date.now();
    const prelude = buildPrelude();
    // Execute prelude separately so user code line numbers stay correct
    await runFresh(code, prelude);
    toast.success('已全量重算', { duration: 1500 });
  }, [status, runFresh, buildPrelude]);

  const handleRunBtn = useCallback(() => {
    const code = editorRef.current?.getValue() ?? '';
    handleRun(code);
  }, [handleRun]);

  const handleRunFreshBtn = useCallback(() => {
    const code = editorRef.current?.getValue() ?? '';
    handleRunFresh(code);
  }, [handleRunFresh]);

  const handleClear = useCallback(() => {
    setLineResults([]);
    setVariables([]);
    setExecTime(null);
    toast.info('已清空结果', { duration: 1500 });
  }, []);

  const handleSaveNow = useCallback(() => {
    const code = editorRef.current?.getValue() ?? '';
    saveCode(code);
    setLastSaved(new Date());
    toast.success('已保存', { duration: 1200 });
  }, []);

  const handleTogglePackage = useCallback((pkg: PackageInfo) => {
    setSelectedPackages((prev) => {
      const next = new Map(prev);
      if (next.has(pkg.name)) {
        next.delete(pkg.name);
        toast.info(`已移除: ${pkg.name}`, { duration: 1200 });
      } else {
        next.set(pkg.name, pkg);
        toast.success(`已选中: ${pkg.name}（运行时自动 import）`, { duration: 1800 });
      }
      return next;
    });
  }, []);

  const handleScrollChange = useCallback((top: number) => {
    setScrollTop(top);
  }, []);

  const handleEditorHoverLine = useCallback((lineIndex: number | null) => {
    setHoveredLine(lineIndex);
  }, []);

  const handleResultHoverLine = useCallback((lineIndex: number | null) => {
    setHoveredLine(lineIndex);
    editorRef.current?.highlightLine(lineIndex);
  }, []);

  const isRunning = status === 'running';
  const isLoading = status === 'loading';
  const isReady = status === 'ready';
  const errorCount = lineResults.filter((r) => r.isError).length;
  const outputCount = lineResults.filter((r) => r.value !== null || r.stdout).length;
  const varPanelOpen = rightPanel === 'var';
  const pkgPanelOpen = rightPanel === 'pkg';
  const anyPanelOpen = rightPanel !== null;

  // Toolbar colors (light theme)
  const toolbarBg = '#f6f8fa';
  const toolbarBorder = 'rgba(0,0,0,0.08)';
  const textMuted = '#57606a';
  const textDim = '#8c959f';
  const primaryColor = '#0550ae';

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: '#f6f8fa', color: '#24292f' }}
    >
      {/* ── Top progress bar ── */}
      <div className="relative h-0.5 w-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
        {(isLoading || isRunning) && (
          <div
            className="absolute inset-y-0 w-1/3 progress-running"
            style={{ background: primaryColor }}
          />
        )}
        {isReady && lineResults.length > 0 && (
          <div
            className="absolute inset-0 transition-all duration-500"
            style={{ background: errorCount > 0 ? 'rgba(207,34,46,0.5)' : 'rgba(26,127,55,0.5)' }}
          />
        )}
      </div>

      {/* ── Toolbar ── */}
      <header
        className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
        style={{ borderColor: toolbarBorder, background: toolbarBg }}
      >
        {/* Logo + Title */}
        <div className="flex items-center gap-2 mr-3">
          <span
            className="text-[15px] font-bold tracking-tight select-none"
            style={{ fontFamily: 'var(--font-mono)', color: primaryColor }}
          >
            &gt;_
          </span>
          <span className="text-[13px] font-semibold" style={{ color: '#24292f' }}>
            PyCalc Live
          </span>
        </div>

        <div className="w-px h-4" style={{ background: 'rgba(0,0,0,0.1)' }} />

        {/* Run button */}
        <button
          onClick={handleRunBtn}
          disabled={isLoading || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-all active:scale-95 disabled:opacity-50"
          style={{ background: primaryColor, color: '#ffffff' }}
          title="运行 (Shift+Enter)"
        >
          {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          运行
        </button>

        {/* Run Fresh button */}
        <button
          onClick={handleRunFreshBtn}
          disabled={isLoading || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-all active:scale-95 disabled:opacity-50 border"
          style={{
            borderColor: `${primaryColor}40`,
            color: primaryColor,
            background: `${primaryColor}0a`,
          }}
          title="全量重算 (Ctrl+Enter)"
        >
          <RefreshCw size={13} />
          全量重算
        </button>

        {/* Clear button */}
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] transition-all active:scale-95 border"
          style={{ borderColor: 'rgba(0,0,0,0.1)', color: textMuted, background: 'transparent' }}
          title="清空结果"
        >
          <Trash2 size={13} />
        </button>

        {/* Save button */}
        <button
          onClick={handleSaveNow}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] transition-all active:scale-95 border"
          style={{ borderColor: 'rgba(0,0,0,0.1)', color: textMuted, background: 'transparent' }}
          title="保存代码"
        >
          <Save size={13} />
        </button>

        <div className="flex-1" />

        {/* Selected packages badges */}
        {selectedPackages.size > 0 && (
          <div className="hidden lg:flex items-center gap-1 mr-1">
            {Array.from(selectedPackages.values() as IterableIterator<PackageInfo>).slice(0, 3).map((pkg) => (
              <span
                key={pkg.name}
                className="text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-70"
                style={{ background: 'rgba(26,127,55,0.1)', color: '#1a7f37', fontFamily: 'var(--font-mono)' }}
                title={`已选中: ${pkg.importAs} — 点击移除`}
                onClick={() => handleTogglePackage(pkg)}
              >
                {pkg.name}
              </span>
            ))}
            {selectedPackages.size > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(26,127,55,0.1)', color: '#1a7f37' }}>
                +{selectedPackages.size - 3}
              </span>
            )}
          </div>
        )}

        {/* Execution stats */}
        {isReady && lineResults.length > 0 && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: textMuted }}>
            {errorCount > 0 ? (
              <span style={{ color: '#cf222e' }}>{errorCount} 个错误</span>
            ) : (
              <span style={{ color: '#1a7f37' }}>{outputCount} 行输出</span>
            )}
            {execTime !== null && (
              <span>· {execTime < 1000 ? `${execTime}ms` : `${(execTime / 1000).toFixed(1)}s`}</span>
            )}
          </div>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: textMuted }}>
          {isLoading && (
            <><Loader2 size={11} className="animate-spin" /><span>加载引擎…</span></>
          )}
          {isRunning && (
            <><Loader2 size={11} className="animate-spin" style={{ color: primaryColor }} /><span style={{ color: primaryColor }}>执行中</span></>
          )}
          {isReady && (
            <><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1a7f37' }} /><span>就绪</span></>
          )}
          {status === 'error' && (
            <><AlertCircle size={11} style={{ color: '#cf222e' }} /><span style={{ color: '#cf222e' }}>引擎错误</span></>
          )}
          {status === 'idle' && (
            <><Loader2 size={11} className="animate-spin opacity-50" /><span>初始化</span></>
          )}
        </div>

        <div className="w-px h-4" style={{ background: 'rgba(0,0,0,0.1)' }} />

        {/* Keyboard hints */}
        <div className="hidden lg:flex items-center gap-3 text-[10px]" style={{ color: textDim }}>
          <span>
            <kbd className="px-1 py-0.5 rounded text-[9px] border" style={{ borderColor: 'rgba(0,0,0,0.15)', background: '#ffffff' }}>
              Shift+↵
            </kbd>
            {' '}运行
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded text-[9px] border" style={{ borderColor: 'rgba(0,0,0,0.15)', background: '#ffffff' }}>
              Ctrl+↵
            </kbd>
            {' '}重算
          </span>
        </div>

        {/* Variable panel toggle */}
        <button
          onClick={() => setRightPanel((p) => p === 'var' ? null : 'var')}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] transition-all"
          style={{
            color: varPanelOpen ? primaryColor : textMuted,
            background: varPanelOpen ? `${primaryColor}10` : 'transparent',
          }}
          title="切换变量面板"
        >
          <Info size={13} />
          <span className="hidden md:inline">变量</span>
        </button>

        {/* Package panel toggle */}
        <button
          onClick={() => setRightPanel((p) => p === 'pkg' ? null : 'pkg')}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] transition-all"
          style={{
            color: pkgPanelOpen ? primaryColor : textMuted,
            background: pkgPanelOpen ? `${primaryColor}10` : 'transparent',
          }}
          title="可用包列表"
        >
          <Package size={13} />
          <span className="hidden md:inline">包</span>
          {selectedPackages.size > 0 && (
            <span
              className="ml-0.5 text-[9px] px-1 py-0.5 rounded-full font-bold"
              style={{ background: primaryColor, color: '#fff', lineHeight: 1 }}
            >
              {selectedPackages.size}
            </span>
          )}
        </button>
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Code editor */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            flex: anyPanelOpen ? '0 0 50%' : '0 0 70%',
            borderRight: `1px solid ${toolbarBorder}`,
            transition: 'flex 200ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b"
            style={{ borderColor: toolbarBorder, background: toolbarBg }}
          >
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: textDim }}>
              代码
            </span>
            <span className="ml-auto text-[10px]" style={{ color: textDim, fontFamily: 'var(--font-mono)' }}>
              Python 3
            </span>
            {lastSaved && (
              <span className="text-[10px]" style={{ color: textDim }}>· 已自动保存</span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              ref={editorRef}
              initialValue={initialCode}
              onChange={handleCodeChange}
              onScrollChange={handleScrollChange}
              onRun={handleRun}
              onRunFresh={handleRunFresh}
              onHoverLine={handleEditorHoverLine}
            />
          </div>
        </div>

        {/* Middle: Result panel */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            flex: anyPanelOpen ? '0 0 25%' : '0 0 30%',
            borderRight: anyPanelOpen ? `1px solid ${toolbarBorder}` : 'none',
            transition: 'flex 200ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 shrink-0 border-b"
            style={{ borderColor: toolbarBorder, background: toolbarBg }}
          >
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: textDim }}>
              输出
            </span>
            {errorCount > 0 && (
              <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color: '#cf222e' }}>
                <AlertCircle size={10} />
                {errorCount} 错误
              </span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <ResultPanel
              lineResults={lineResults}
              totalLines={lineCount}
              scrollTop={scrollTop}
              hoveredLine={hoveredLine}
              onHoverLine={handleResultHoverLine}
            />
          </div>
        </div>

        {/* Right: Variable panel (mutually exclusive with pkg panel) */}
        {varPanelOpen && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ flex: '0 0 25%', minWidth: 180, maxWidth: 280 }}
          >
            <VariablePanel variables={variables} isRunning={isRunning} />
          </div>
        )}

        {/* Right: Package panel (mutually exclusive with var panel) */}
        {pkgPanelOpen && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ flex: '0 0 25%', minWidth: 220, maxWidth: 280 }}
          >
            <PackagePanel
              selectedPackages={new Set(selectedPackages.keys())}
              onTogglePackage={handleTogglePackage}
              onClose={() => setRightPanel(null)}
            />
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {loadError && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-[12px] shrink-0"
          style={{ background: 'rgba(207,34,46,0.08)', color: '#cf222e' }}
        >
          <AlertCircle size={13} />
          <span>Python 引擎加载失败：{loadError}</span>
          <span className="ml-2 text-[11px] opacity-70">请检查网络连接（需访问 cdn.jsdelivr.net）</span>
        </div>
      )}
    </div>
  );
}
