/**
 * PyCalc Live — Python 执行引擎
 * 使用 Pyodide (WebAssembly) 在浏览器内运行 Python，无需后端。
 * 
 * 核心功能：
 * 1. 逐行 AST 分析，自动捕获每行表达式的值（无需 print()）
 * 2. 执行后扫描命名空间，返回所有用户定义变量
 * 3. 支持全量重算（重置环境后重新执行）
 */

export interface LineResult {
  lineIndex: number;   // 0-based line index in source
  value: string | null;
  isError: boolean;
  errorMsg?: string;
  stdout?: string;     // captured print() output for this line
  isAssignment?: boolean; // true if result is from assignment (MATLAB style)
}

export interface VarInfo {
  name: string;
  type: string;
  value: string;
  updated: boolean;    // true if value changed since last run
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
      // Dynamically load Pyodide script
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

_BUILTIN_NAMES = set(dir(builtins)) | {
    '__builtins__', '__name__', '__doc__', '__package__',
    '__loader__', '__spec__', '__annotations__', '__cached__',
    '_BUILTIN_NAMES', '_pycalc_exec', '_pycalc_get_vars',
    '_pycalc_stdout_capture',
}

def _pycalc_repr(val):
    """Smart repr: numpy arrays, pandas, etc. get concise display."""
    try:
        # numpy array
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
        # pandas DataFrame / Series
        import pandas as pd
        if isinstance(val, pd.DataFrame):
            rows, cols = val.shape
            return f"DataFrame({rows}×{cols})\\n" + val.to_string(max_rows=8, max_cols=6)
        if isinstance(val, pd.Series):
            return f"Series(len={len(val)})\\n" + val.to_string(max_rows=8)
    except ImportError:
        pass
    r = repr(val)
    if len(r) > 500:
        r = r[:497] + '...'
    return r

def _pycalc_exec(source, user_globals):
    """
    Execute source code line-by-line (logically), capturing per-line results.
    Returns list of dicts: {line_index, value, is_error, error_msg, stdout}
    """
    results = []
    
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return [{"line_index": (e.lineno or 1) - 1, "value": None,
                 "is_error": True, "error_msg": f"SyntaxError: {e.msg} (line {e.lineno})",
                 "stdout": "", "is_assignment": False}]
    
    # Map each top-level statement to its starting line (0-based)
    # We'll execute statements one by one
    source_lines = source.splitlines()
    n_lines = len(source_lines)
    
    # Pre-fill results for all lines with None
    line_results = [{"line_index": i, "value": None, "is_error": False,
                     "error_msg": None, "stdout": "", "is_assignment": False} for i in range(n_lines)]
    
    # Collect all top-level statements
    stmts = tree.body
    if not stmts:
        return line_results
    
    # Execute each statement, capturing stdout and expression value
    for stmt in stmts:
        stmt_line = stmt.lineno - 1  # 0-based
        
        # Capture stdout
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        
        try:
            # For expression statements, try to get the value
            if isinstance(stmt, ast.Expr):
                # Compile as eval to get value
                try:
                    code = compile(ast.Expression(body=stmt.value), '<pycalc>', 'eval')
                    val = eval(code, user_globals)
                    captured = sys.stdout.getvalue()
                    sys.stdout = old_stdout
                    if val is not None:
                        line_results[stmt_line]["value"] = _pycalc_repr(val)
                    if captured:
                        line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
                except Exception as e:
                    captured = sys.stdout.getvalue()
                    sys.stdout = old_stdout
                    line_results[stmt_line]["is_error"] = True
                    line_results[stmt_line]["error_msg"] = _format_error(e)
                    if captured:
                        line_results[stmt_line]["stdout"] = captured.rstrip('\\n')
            else:
                # For non-expression statements (assignments, for loops, etc.)
                # Compile and exec the single statement
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
    # Filter out internal pyodide/pycalc frames
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
  // Re-run helper to reset globals
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

  // Convert Pyodide proxy to JS array
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
      });
    }
  }

  // Get variables
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
    // Update prev values
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
