/**
 * PyCalc Live — Python 执行引擎
 * 使用 Pyodide (WebAssembly) 在浏览器内运行 Python，无需后端。
 *
 * 核心功能：
 * 1. 逐行 AST 分析，自动捕获每行表达式的值（无需 print()）
 * 2. 执行后扫描命名空间，返回所有用户定义变量
 * 3. 支持全量重算（重置环境后重新执行）
 * 4. matplotlib plt.show() 捕获为 SVG 内嵌显示
 */

export interface LineResult {
  lineIndex: number;
  value: string | null;
  isError: boolean;
  errorMsg?: string;
  stdout?: string;
  isAssignment?: boolean;
  plotSvg?: string;   // base64 PNG or SVG string from matplotlib
}

export interface VarInfo {
  name: string;
  type: string;
  value: string;
  updated: boolean;
}

export interface ExecResult {
  lineResults: LineResult[];
  variables: VarInfo[];
  globalError?: string;
}

// Pyodide CDN URL
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';

let pyodideInstance: any = null;
let pyodideLoading: Promise<any> | null = null;

export async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = new Promise(async (resolve, reject) => {
    try {
      await new Promise<void>((res, rej) => {
        if ((window as any).loadPyodide) { res(); return; }
        const script = document.createElement('script');
        script.src = PYODIDE_CDN;
        script.onload = () => res();
        script.onerror = () => rej(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });

      const py = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/',
      });
      pyodideInstance = py;
      resolve(py);
    } catch (e) {
      pyodideLoading = null;
      reject(e);
    }
  });

  return pyodideLoading;
}

// Python helper script injected into Pyodide namespace
const PYCALC_HELPER = `
import ast
import sys
import io
import traceback
import builtins
import base64

_BUILTIN_NAMES = set(dir(builtins)) | {
    '__builtins__', '__name__', '__doc__', '__package__',
    '__loader__', '__spec__', '__annotations__', '__cached__',
    '_BUILTIN_NAMES', '_pycalc_exec', '_pycalc_get_vars',
    '_pycalc_stdout_capture',
}

def _pycalc_repr(val):
    """Smart repr: numpy arrays, pandas, etc. get concise display."""
    try:
        import numpy as np
        if isinstance(val, np.ndarray):
            if val.ndim == 0:
                return repr(val.item())
            if val.size <= 100:
                return repr(val)
            return f"array(shape={val.shape}, dtype={val.dtype})"
    except ImportError:
        pass
    try:
        import pandas as pd
        if isinstance(val, pd.DataFrame):
            rows, cols = val.shape
            return f"DataFrame({rows}x{cols})\\n" + val.to_string(max_rows=8, max_cols=6)
        if isinstance(val, pd.Series):
            return f"Series(len={len(val)})\\n" + val.to_string(max_rows=8)
    except ImportError:
        pass
    r = repr(val)
    if len(r) > 500:
        r = r[:497] + '...'
    return r

def _pycalc_capture_plot():
    """Capture current matplotlib figure as base64 PNG. Returns empty string if no figure."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        if not plt.get_fignums():
            return ''
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=120,
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        return 'data:image/png;base64,' + data
    except Exception:
        return ''

def _pycalc_exec(source, user_globals):
    """
    Execute source code line-by-line (logically), capturing per-line results.
    Returns list of dicts: {line_index, value, is_error, error_msg, stdout, is_assignment, plot_svg}
    """
    results = []

    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return [{"line_index": (e.lineno or 1) - 1, "value": None,
                 "is_error": True, "error_msg": f"SyntaxError: {e.msg} (line {e.lineno})",
                 "stdout": "", "is_assignment": False, "plot_svg": ""}]

    source_lines = source.splitlines()
    n_lines = len(source_lines)

    line_results = [{"line_index": i, "value": None, "is_error": False,
                     "error_msg": None, "stdout": "", "is_assignment": False,
                     "plot_svg": ""} for i in range(n_lines)]

    stmts = tree.body
    if not stmts:
        return line_results

    # Setup matplotlib non-interactive backend before execution
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        plt.close('all')
    except ImportError:
        pass

    for stmt in stmts:
        stmt_line = stmt.lineno - 1  # 0-based

        old_stdout = sys.stdout
        sys.stdout = io.StringIO()

        try:
            if isinstance(stmt, ast.Expr):
                # Check if this is plt.show() call
                is_plt_show = False
                try:
                    if (isinstance(stmt.value, ast.Call) and
                        isinstance(stmt.value.func, ast.Attribute) and
                        stmt.value.func.attr == 'show'):
                        is_plt_show = True
                except Exception:
                    pass

                if is_plt_show:
                    # Capture plot instead of executing show()
                    captured = sys.stdout.getvalue()
                    sys.stdout = old_stdout
                    plot_data = _pycalc_capture_plot()
                    if plot_data:
                        line_results[stmt_line]["plot_svg"] = plot_data
                    if captured:
                        line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
                else:
                    try:
                        code = compile(ast.Expression(body=stmt.value), '<pycalc>', 'eval')
                        val = eval(code, user_globals)
                        captured = sys.stdout.getvalue()
                        sys.stdout = old_stdout
                        if val is not None:
                            line_results[stmt_line]["value"] = _pycalc_repr(val)
                        if captured:
                            line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
                        # Check if a plot was generated as side effect
                        plot_data = _pycalc_capture_plot()
                        if plot_data:
                            line_results[stmt_line]["plot_svg"] = plot_data
                    except Exception as e:
                        captured = sys.stdout.getvalue()
                        sys.stdout = old_stdout
                        line_results[stmt_line]["is_error"] = True
                        line_results[stmt_line]["error_msg"] = _format_error(e)
                        if captured:
                            line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
            else:
                mod = ast.Module(body=[stmt], type_ignores=[])
                code = compile(mod, '<pycalc>', 'exec')
                exec(code, user_globals)
                captured = sys.stdout.getvalue()
                sys.stdout = old_stdout
                if captured:
                    line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
                # MATLAB-style: show value for assignment statements
                if isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                    try:
                        if isinstance(stmt, ast.Assign):
                            targets = stmt.targets
                        elif isinstance(stmt, ast.AnnAssign):
                            targets = [stmt.target] if stmt.value is not None else []
                        else:
                            targets = [stmt.target]
                        for target in targets:
                            if isinstance(target, ast.Name):
                                var_name = target.id
                                if var_name in user_globals:
                                    line_results[stmt_line]["value"] = f"{var_name} = {_pycalc_repr(user_globals[var_name])}"
                                    line_results[stmt_line]["is_assignment"] = True
                                    break
                            elif isinstance(target, ast.Tuple):
                                names = [n.id for n in target.elts if isinstance(n, ast.Name)]
                                if names:
                                    parts = [f"{n} = {_pycalc_repr(user_globals[n])}" for n in names[:3] if n in user_globals]
                                    if parts:
                                        line_results[stmt_line]["value"] = ",  ".join(parts)
                                        line_results[stmt_line]["is_assignment"] = True
                    except Exception:
                        pass
                # Check if a plot was generated as side effect of this statement
                plot_data = _pycalc_capture_plot()
                if plot_data:
                    line_results[stmt_line]["plot_svg"] = plot_data
        except Exception as e:
            captured = sys.stdout.getvalue()
            sys.stdout = old_stdout
            line_results[stmt_line]["is_error"] = True
            line_results[stmt_line]["error_msg"] = _format_error(e)
            if captured:
                line_results[stmt_line]["stdout"] = captured.rstrip('\\n')

    return line_results

def _format_error(e):
    tb_lines = traceback.format_exception(type(e), e, e.__traceback__)
    filtered = []
    for line in tb_lines:
        if '<pycalc>' in line or 'Traceback' in line or type(e).__name__ in line:
            filtered.append(line)
    if filtered:
        return ''.join(filtered).strip()
    return f"{type(e).__name__}: {e}"

def _pycalc_get_vars(user_globals):
    """Return list of user-defined variables with type and repr."""
    skip = _BUILTIN_NAMES
    vars_list = []
    for name, val in user_globals.items():
        if name.startswith('_') or name in skip:
            continue
        try:
            type_name = type(val).__name__
            val_repr = _pycalc_repr(val)
        except Exception:
            type_name = '?'
            val_repr = '<error>'
        vars_list.append({"name": name, "type": type_name, "value": val_repr})
    return vars_list
`;

// Persistent user namespace across runs (cleared on full reset)
let userGlobals: any = null;
let prevVarValues: Map<string, string> = new Map();

export async function initPyodideEnv(): Promise<void> {
  const py = await loadPyodide();
  py.runPython(PYCALC_HELPER);
  userGlobals = py.globals.get('dict')();
}

export async function resetEnv(): Promise<void> {
  const py = await loadPyodide();
  userGlobals = py.globals.get('dict')();
  prevVarValues = new Map();
}

export async function executeCode(source: string): Promise<ExecResult> {
  const py = await loadPyodide();

  if (!userGlobals) {
    await initPyodideEnv();
  }

  const pycalcExec = py.globals.get('_pycalc_exec');
  const pycalcGetVars = py.globals.get('_pycalc_get_vars');

  let lineResultsRaw: any;
  let globalError: string | undefined;

  try {
    lineResultsRaw = pycalcExec(source, userGlobals);
  } catch (e: any) {
    globalError = String(e);
    lineResultsRaw = [];
  }

  const lineResults: LineResult[] = [];
  if (lineResultsRaw) {
    const arr = lineResultsRaw.toJs ? lineResultsRaw.toJs({ dict_converter: Object.fromEntries }) : lineResultsRaw;
    for (const item of arr) {
      lineResults.push({
        lineIndex: item.line_index ?? item.get?.('line_index') ?? 0,
        value: item.value ?? item.get?.('value') ?? null,
        isError: item.is_error ?? item.get?.('is_error') ?? false,
        errorMsg: item.error_msg ?? item.get?.('error_msg') ?? undefined,
        stdout: item.stdout ?? item.get?.('stdout') ?? '',
        isAssignment: !!(item.is_assignment ?? item.get?.('is_assignment') ?? false),
        plotSvg: item.plot_svg ?? item.get?.('plot_svg') ?? '',
      });
    }
  }

  let variables: VarInfo[] = [];
  try {
    const varsRaw = pycalcGetVars(userGlobals);
    const varsArr = varsRaw.toJs ? varsRaw.toJs({ dict_converter: Object.fromEntries }) : varsRaw;
    for (const v of varsArr) {
      const name = v.name ?? v.get?.('name') ?? '';
      const type = v.type ?? v.get?.('type') ?? '';
      const value = v.value ?? v.get?.('value') ?? '';
      const updated = prevVarValues.get(name) !== value;
      variables.push({ name, type, value, updated });
    }
    const newMap = new Map<string, string>();
    for (const v of variables) newMap.set(v.name, v.value);
    prevVarValues = newMap;
  } catch (e) {
    // ignore variable extraction errors
  }

  return { lineResults, variables, globalError };
}

export async function executeCodeFresh(source: string): Promise<ExecResult> {
  await resetEnv();
  return executeCode(source);
}

// ─── Package Discovery ───────────────────────────────────────────────────────

export interface PackageInfo {
  name: string;
  description: string;
  category: string;
  importAs?: string;   // suggested import alias
}

// Curated list of packages available in Pyodide 0.27.5
export const PYODIDE_PACKAGES: PackageInfo[] = [
  // Math & Science
  { name: 'numpy', description: '数值计算，N维数组', category: '数学/科学', importAs: 'import numpy as np' },
  { name: 'scipy', description: '科学计算，优化/积分/信号处理', category: '数学/科学', importAs: 'import scipy' },
  { name: 'sympy', description: '符号数学，代数/微积分/方程求解', category: '数学/科学', importAs: 'import sympy as sp' },
  { name: 'mpmath', description: '任意精度浮点数学', category: '数学/科学', importAs: 'import mpmath' },
  // Data
  { name: 'pandas', description: '数据分析，DataFrame/Series', category: '数据处理', importAs: 'import pandas as pd' },
  { name: 'pyarrow', description: '列式数据格式，高性能数据处理', category: '数据处理', importAs: 'import pyarrow as pa' },
  // Visualization
  { name: 'matplotlib', description: '绘图库，折线/散点/柱状/热图等', category: '可视化', importAs: 'import matplotlib.pyplot as plt' },
  { name: 'pillow', description: '图像处理，PIL', category: '可视化', importAs: 'from PIL import Image' },
  // ML
  { name: 'scikit-learn', description: '机器学习，分类/回归/聚类', category: '机器学习', importAs: 'import sklearn' },
  { name: 'statsmodels', description: '统计模型，回归/时间序列', category: '机器学习', importAs: 'import statsmodels.api as sm' },
  // Stdlib (always available)
  { name: 'math', description: '标准数学函数（内置，无需安装）', category: '标准库', importAs: 'import math' },
  { name: 'cmath', description: '复数数学（内置）', category: '标准库', importAs: 'import cmath' },
  { name: 'statistics', description: '统计函数，均值/方差/中位数（内置）', category: '标准库', importAs: 'import statistics' },
  { name: 'random', description: '随机数生成（内置）', category: '标准库', importAs: 'import random' },
  { name: 'itertools', description: '迭代器工具（内置）', category: '标准库', importAs: 'import itertools' },
  { name: 'functools', description: '函数工具，reduce/partial（内置）', category: '标准库', importAs: 'import functools' },
  { name: 'collections', description: 'Counter/deque/defaultdict（内置）', category: '标准库', importAs: 'from collections import Counter, defaultdict, deque' },
  { name: 'datetime', description: '日期时间处理（内置）', category: '标准库', importAs: 'from datetime import datetime, timedelta' },
  { name: 'json', description: 'JSON 序列化/反序列化（内置）', category: '标准库', importAs: 'import json' },
  { name: 're', description: '正则表达式（内置）', category: '标准库', importAs: 'import re' },
  { name: 'string', description: '字符串常量和模板（内置）', category: '标准库', importAs: 'import string' },
  { name: 'decimal', description: '精确十进制浮点（内置）', category: '标准库', importAs: 'from decimal import Decimal' },
  { name: 'fractions', description: '有理数分数（内置）', category: '标准库', importAs: 'from fractions import Fraction' },
  // Network / IO (limited in browser)
  { name: 'io', description: '字节/字符串 IO 流（内置）', category: '标准库', importAs: 'import io' },
  { name: 'struct', description: '二进制数据打包/解包（内置）', category: '标准库', importAs: 'import struct' },
  { name: 'hashlib', description: 'MD5/SHA 哈希（内置）', category: '标准库', importAs: 'import hashlib' },
  { name: 'base64', description: 'Base64 编解码（内置）', category: '标准库', importAs: 'import base64' },
];

// Install a package via micropip (for packages not bundled in Pyodide)
export async function installPackage(packageName: string): Promise<void> {
  const py = await loadPyodide();
  await py.loadPackage('micropip');
  const micropip = py.pyimport('micropip');
  await micropip.install(packageName);
}

// Load a bundled Pyodide package (faster than micropip)
export async function loadBundledPackage(packageName: string): Promise<void> {
  const py = await loadPyodide();
  await py.loadPackage(packageName);
}
