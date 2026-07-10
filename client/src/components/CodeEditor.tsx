/**
 * CodeEditor — CodeMirror 6 编辑器组件
 * 功能：Python 语法高亮、行号、Shift+Enter 触发运行、滚动同步
 * Design: Dark IDE Aesthetic — Catppuccin Mocha palette
 */
import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from '@codemirror/language';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';

export interface CodeEditorHandle {
  getValue: () => string;
  setValue: (code: string) => void;
  getScrollTop: () => number;
  getLineCount: () => number;
}

interface CodeEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
  onScrollChange?: (scrollTop: number) => void;
  onRun?: (value: string) => void;
  onRunFresh?: (value: string) => void;
  readOnly?: boolean;
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  ({ initialValue = '', onChange, onScrollChange, onRun, onRunFresh, readOnly = false }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onRunRef = useRef(onRun);
    const onRunFreshRef = useRef(onRunFresh);
    const onChangeRef = useRef(onChange);
    const onScrollRef = useRef(onScrollChange);

    // Keep refs up to date
    useEffect(() => { onRunRef.current = onRun; }, [onRun]);
    useEffect(() => { onRunFreshRef.current = onRunFresh; }, [onRunFresh]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { onScrollRef.current = onScrollChange; }, [onScrollChange]);

    useImperativeHandle(ref, () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? '',
      setValue: (code: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code },
        });
      },
      getScrollTop: () => viewRef.current?.scrollDOM.scrollTop ?? 0,
      getLineCount: () => viewRef.current?.state.doc.lines ?? 1,
    }));

    const initEditor = useCallback(() => {
      if (!containerRef.current || viewRef.current) return;

      const runKeymap = keymap.of([
        {
          key: 'Shift-Enter',
          run: (view) => {
            onRunRef.current?.(view.state.doc.toString());
            return true;
          },
        },
        {
          key: 'Ctrl-Enter',
          mac: 'Cmd-Enter',
          run: (view) => {
            onRunFreshRef.current?.(view.state.doc.toString());
            return true;
          },
        },
      ]);

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
        if (update.geometryChanged || update.docChanged) {
          onScrollRef.current?.(update.view.scrollDOM.scrollTop);
        }
      });

      const scrollListener = EditorView.domEventHandlers({
        scroll: (_, view) => {
          onScrollRef.current?.(view.scrollDOM.scrollTop);
        },
      });

      const state = EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          python(),
          oneDark,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          runKeymap,
          updateListener,
          scrollListener,
          EditorView.editable.of(!readOnly),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '14px',
            },
            '.cm-scroller': {
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineHeight: '22px',
            },
            '.cm-content': { padding: '0' },
            '.cm-line': { padding: '0 12px', lineHeight: '22px', minHeight: '22px' },
            '.cm-gutters': {
              background: 'oklch(0.155 0.016 265)',
              borderRight: '1px solid oklch(1 0 0 / 8%)',
              color: 'oklch(0.45 0.01 265)',
            },
            '.cm-lineNumbers .cm-gutterElement': {
              padding: '0 8px 0 4px',
              lineHeight: '22px',
              fontSize: '12px',
            },
            '.cm-activeLine': { background: 'oklch(1 0 0 / 4%)' },
            '.cm-activeLineGutter': {
              background: 'oklch(1 0 0 / 6%)',
              color: 'oklch(0.72 0.14 265)',
            },
            '.cm-cursor': { borderLeftColor: 'oklch(0.72 0.14 265)' },
            '.cm-selectionBackground': { background: 'oklch(0.72 0.14 265 / 25%) !important' },
            '&.cm-focused .cm-selectionBackground': { background: 'oklch(0.72 0.14 265 / 30%) !important' },
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
    }, [initialValue, readOnly]);

    useEffect(() => {
      initEditor();
      return () => {
        viewRef.current?.destroy();
        viewRef.current = null;
      };
    }, [initEditor]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
        style={{ background: 'oklch(0.155 0.016 265)' }}
      />
    );
  }
);

CodeEditor.displayName = 'CodeEditor';
export default CodeEditor;
