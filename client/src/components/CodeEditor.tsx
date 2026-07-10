/**
 * CodeEditor — CodeMirror 6 编辑器组件
 * 功能：Python 语法高亮、行号、Shift+Enter 触发运行、滚动同步、hover 行高亮
 * Design: Light IDE Aesthetic — GitHub Light inspired
 */
import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';

export interface CodeEditorHandle {
  getValue: () => string;
  setValue: (code: string) => void;
  getScrollTop: () => number;
  getLineCount: () => number;
  highlightLine: (lineIndex: number | null) => void;
  appendText: (text: string) => void;
}

interface CodeEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
  onScrollChange?: (scrollTop: number) => void;
  onRun?: (value: string) => void;
  onRunFresh?: (value: string) => void;
  onHoverLine?: (lineIndex: number | null) => void;
  readOnly?: boolean;
}

// GitHub Light syntax highlight style
const githubLightHighlight = HighlightStyle.define([
  { tag: tags.keyword,           color: '#cf222e', fontWeight: '600' },
  { tag: tags.operator,          color: '#0550ae' },
  { tag: tags.number,            color: '#0550ae' },
  { tag: tags.string,            color: '#0a3069' },
  { tag: tags.comment,           color: '#6e7781', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#8250df' },
  { tag: tags.definition(tags.variableName), color: '#24292f' },
  { tag: tags.variableName,      color: '#24292f' },
  { tag: tags.typeName,          color: '#953800' },
  { tag: tags.className,         color: '#953800' },
  { tag: tags.propertyName,      color: '#0550ae' },
  { tag: tags.bool,              color: '#0550ae', fontWeight: '600' },
  { tag: tags.null,              color: '#0550ae', fontWeight: '600' },
  { tag: tags.punctuation,       color: '#24292f' },
  { tag: tags.bracket,           color: '#24292f' },
  { tag: tags.meta,              color: '#6e7781' },
  { tag: tags.special(tags.string), color: '#0a3069' },
]);

// StateEffect to set hovered line (0-based, null = clear)
const setHoverLineEffect = StateEffect.define<number | null>();

// StateField holding the current hovered line decoration
const hoverLineField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHoverLineEffect)) {
        if (e.value === null) {
          deco = Decoration.none;
        } else {
          const lineNum = e.value + 1; // 1-based
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum);
            const builder = new RangeSetBuilder<Decoration>();
            builder.add(
              line.from,
              line.from,
              Decoration.line({ class: 'cm-hover-highlight' })
            );
            deco = builder.finish();
          } else {
            deco = Decoration.none;
          }
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  ({ initialValue = '', onChange, onScrollChange, onRun, onRunFresh, onHoverLine, readOnly = false }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onRunRef = useRef(onRun);
    const onRunFreshRef = useRef(onRunFresh);
    const onChangeRef = useRef(onChange);
    const onScrollRef = useRef(onScrollChange);
    const onHoverLineRef = useRef(onHoverLine);

    useEffect(() => { onRunRef.current = onRun; }, [onRun]);
    useEffect(() => { onRunFreshRef.current = onRunFresh; }, [onRunFresh]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { onScrollRef.current = onScrollChange; }, [onScrollChange]);
    useEffect(() => { onHoverLineRef.current = onHoverLine; }, [onHoverLine]);

    useImperativeHandle(ref, () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? '',
      setValue: (code: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
      },
      getScrollTop: () => viewRef.current?.scrollDOM.scrollTop ?? 0,
      getLineCount: () => viewRef.current?.state.doc.lines ?? 1,
      highlightLine: (lineIndex: number | null) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ effects: setHoverLineEffect.of(lineIndex) });
      },
      appendText: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        const end = doc.length;
        // Add newline before if doc doesn't end with one
        const needsNewline = end > 0 && doc.sliceString(end - 1) !== '\n';
        const insert = (needsNewline ? '\n' : '') + text;
        view.dispatch({
          changes: { from: end, to: end, insert },
          selection: { anchor: end + insert.length },
        });
        view.focus();
      },
    }));

    const initEditor = useCallback(() => {
      if (!containerRef.current || viewRef.current) return;

      const runKeymap = keymap.of([
        {
          key: 'Shift-Enter',
          run: (view) => { onRunRef.current?.(view.state.doc.toString()); return true; },
        },
        {
          key: 'Ctrl-Enter',
          mac: 'Cmd-Enter',
          run: (view) => { onRunFreshRef.current?.(view.state.doc.toString()); return true; },
        },
      ]);

      const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
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

      // Mouse hover plugin — emit line index on mousemove, null on mouseleave
      const hoverPlugin = ViewPlugin.fromClass(class {
        private lastLine: number | null = null;
        constructor(private view: EditorView) {
          this.handleMouseMove = this.handleMouseMove.bind(this);
          this.handleMouseLeave = this.handleMouseLeave.bind(this);
          view.dom.addEventListener('mousemove', this.handleMouseMove);
          view.dom.addEventListener('mouseleave', this.handleMouseLeave);
        }
        handleMouseMove(e: MouseEvent) {
          const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) return;
          const lineNum = this.view.state.doc.lineAt(pos).number - 1; // 0-based
          if (lineNum !== this.lastLine) {
            this.lastLine = lineNum;
            onHoverLineRef.current?.(lineNum);
          }
        }
        handleMouseLeave() {
          if (this.lastLine !== null) {
            this.lastLine = null;
            onHoverLineRef.current?.(null);
          }
        }
        destroy() {
          this.view.dom.removeEventListener('mousemove', this.handleMouseMove);
          this.view.dom.removeEventListener('mouseleave', this.handleMouseLeave);
        }
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
          syntaxHighlighting(githubLightHighlight),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          runKeymap,
          updateListener,
          scrollListener,
          hoverPlugin,
          hoverLineField,
          EditorView.editable.of(!readOnly),
          EditorView.theme({
            '&': { height: '100%', fontSize: '14px', background: '#ffffff' },
            '.cm-scroller': {
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineHeight: '22px',
              background: '#ffffff',
            },
            '.cm-content': { padding: '0', background: '#ffffff' },
            '.cm-line': { padding: '0 12px', lineHeight: '22px', minHeight: '22px' },
            '.cm-gutters': {
              background: '#f6f8fa',
              borderRight: '1px solid rgba(0,0,0,0.08)',
              color: '#8c959f',
            },
            '.cm-lineNumbers .cm-gutterElement': {
              padding: '0 8px 0 4px',
              lineHeight: '22px',
              fontSize: '12px',
            },
            '.cm-activeLine': { background: 'rgba(81,130,187,0.06)' },
            '.cm-activeLineGutter': {
              background: 'rgba(81,130,187,0.10)',
              color: '#0550ae',
            },
            '.cm-hover-highlight': { background: 'rgba(81,130,187,0.08)' },
            '.cm-cursor': { borderLeftColor: '#0550ae' },
            '.cm-selectionBackground': { background: 'rgba(81,130,187,0.15) !important' },
            '&.cm-focused .cm-selectionBackground': { background: 'rgba(81,130,187,0.20) !important' },
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
        style={{ background: '#ffffff' }}
      />
    );
  }
);

CodeEditor.displayName = 'CodeEditor';
export default CodeEditor;
