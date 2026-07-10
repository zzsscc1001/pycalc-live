/**
 * Home — PyCalc Live 主界面
 * 布局：顶部工具栏 + 三栏（代码编辑器 | 结果面板 | 变量侧边栏）
 * Design: Light IDE Aesthetic — GitHub Light inspired
 *
 * 特性：
 * - Pyodide WebAssembly Python 引擎（浏览器内运行，无需服务器）
 * - 逐行自动输出结果（含赋值语句，MATLAB 风格），与代码行高严格对齐（22px）
 * - 变量侧边栏实时显示命名空间
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
import { usePyodide } from '@/hooks/usePyodide';
import { LineResult, VarInfo } from '@/lib/pyodideEngine';
import {
  Play,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
  Save,
} from 'lucide-react';
import { Package } from 'lucide-react';
import PackagePanel from '@/components/PackagePanel';

const STORAGE_KEY = 'pycalc-live-code';

const DEFAULT_CODE = `# PyCalc Live — 交互式 Python 计算器
# 按 Shift+Enter 运行，Ctrl+Enter 全量重算

x = 42
y = 3.14
a = x + y

# 列表和推导式
nums = [i**2 for i in range(1, 6)]
nums

# 字符串操作
name = "PyCalc"
greeting = f"Hello, {name}!"

# 数学计算
import math
result = math.sqrt(2) * math.pi
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
  const [lineResults, setLineResults] = useState<LineResult[]>([]);
  const [variables, setVariables] = useState<VarInfo[]>([]);
  const [varPanelOpen, setVarPanelOpen] = useState(true);
  const [pkgPanelOpen, setPkgPanelOpen] = useState(false);
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

  const handleRun = useCallback(async (code: string) => {
    if (status === 'loading') { toast.info('Python 引擎加载中，请稍候…'); return; }
    const lc = editorRef.current?.getLineCount() ?? code.split('\n').length;
    setLineCount(lc);
    execStartRef.current = Date.now();
    await run(code);
  }, [status, run]);

  const handleRunFresh = useCallback(async (code: string) => {
    if (status === 'loading') { toast.info('Python 引擎加载中，请稍候…'); return; }
    const lc = editorRef.current?.getLineCount() ?? code.split('\n').length;
    setLineCount(lc);
    setLineResults([]);
    setVariables([]);
    execStartRef.current = Date.now();
    await runFresh(code);
    toast.success('已全量重算', { duration: 1500 });
  }, [status, runFresh]);

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

  const handleInsertImport = useCallback((importStatement: string) => {
    editorRef.current?.appendText(importStatement);
    toast.success(`已插入: ${importStatement.split('\n')[0]}`, { duration: 1500 });
  }, []);

  const handleScrollChange = useCallback((top: number) => {
    setScrollTop(top);
  }, []);

  // Hover line: from editor → highlight result row; from result → highlight editor line
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
          onClick={() => setVarPanelOpen((v) => !v)}
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
          onClick={() => setPkgPanelOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] transition-all"
          style={{
            color: pkgPanelOpen ? primaryColor : textMuted,
            background: pkgPanelOpen ? `${primaryColor}10` : 'transparent',
          }}
          title="可用包列表"
        >
          <Package size={13} />
          <span className="hidden md:inline">包</span>
        </button>
      </header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Code editor */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            flex: (varPanelOpen || pkgPanelOpen) ? '0 0 50%' : '0 0 70%',
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
              initialValue={loadSavedCode()}
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
            flex: (varPanelOpen || pkgPanelOpen) ? '0 0 25%' : '0 0 30%',
            borderRight: (varPanelOpen || pkgPanelOpen) ? `1px solid ${toolbarBorder}` : 'none',
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

        {/* Right: Variable panel */}
        {varPanelOpen && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ flex: '0 0 20%', minWidth: 180 }}
          >
            <VariablePanel variables={variables} isRunning={isRunning} />
          </div>
        )}

        {/* Right: Package panel */}
        {pkgPanelOpen && (
          <div
            className="flex flex-col overflow-hidden"
            style={{ flex: '0 0 25%', minWidth: 220 }}
          >
            <PackagePanel
              onInsertImport={handleInsertImport}
              onClose={() => setPkgPanelOpen(false)}
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
