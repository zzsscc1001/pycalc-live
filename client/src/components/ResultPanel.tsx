/**
 * ResultPanel — 逐行结果输出面板
 * 与代码编辑器行高严格对齐（22px/行），自动显示表达式值和 print() 输出。
 * Design: Dark IDE Aesthetic — Catppuccin Mocha palette
 */
import { useState } from 'react';
import { LineResult } from '@/lib/pyodideEngine';
import { X, ChevronDown } from 'lucide-react';

const LINE_HEIGHT = 22; // px — must match CSS --line-height-code

interface ResultPanelProps {
  lineResults: LineResult[];
  totalLines: number;
  scrollTop: number;
}

export default function ResultPanel({ lineResults, totalLines, scrollTop }: ResultPanelProps) {
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState('');

  // Build a map: lineIndex -> result
  const resultMap = new Map<number, LineResult>();
  for (const r of lineResults) {
    resultMap.set(r.lineIndex, r);
  }

  const handleExpand = (lineIndex: number, content: string) => {
    setExpandedLine(lineIndex);
    setExpandedContent(content);
  };

  const hasResults = lineResults.length > 0;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: 'oklch(0.168 0.017 265)' }}
    >
      {/* Subtle row-stripe to hint at line-by-line rhythm even before execution */}
      {!hasResults && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.04 }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: LINE_HEIGHT,
                background: i % 2 === 0 ? 'oklch(1 0 0)' : 'transparent',
              }}
            />
          ))}
        </div>
      )}

      {/* Scrollable content, synced with editor scroll */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          style={{
            transform: `translateY(-${scrollTop}px)`,
            willChange: 'transform',
          }}
        >
          {Array.from({ length: totalLines }).map((_, i) => {
            const r = resultMap.get(i);
            const hasOutput = r && (r.value !== null || r.stdout || r.isError);
            return (
              <ResultRow
                key={i}
                lineIndex={i}
                result={r}
                hasOutput={!!hasOutput}
                onExpand={handleExpand}
              />
            );
          })}
        </div>
      </div>

      {/* Expanded output modal */}
      {expandedLine !== null && (
        <div
          className="absolute inset-0 z-10 flex flex-col"
          style={{ background: 'oklch(0.155 0.016 265)' }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b shrink-0"
            style={{ borderColor: 'oklch(1 0 0 / 8%)' }}
          >
            <span
              className="text-[11px] font-semibold"
              style={{ color: 'oklch(0.62 0.02 265)', fontFamily: 'var(--font-mono)' }}
            >
              第 {expandedLine + 1} 行输出
            </span>
            <button
              onClick={() => setExpandedLine(null)}
              className="p-1 rounded hover:bg-white/5 transition-colors"
              style={{ color: 'oklch(0.62 0.02 265)' }}
            >
              <X size={13} />
            </button>
          </div>
          <pre
            className="flex-1 overflow-auto p-3 text-[12px] leading-relaxed"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'oklch(0.855 0.025 265)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {expandedContent}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ResultRowProps {
  lineIndex: number;
  result?: LineResult;
  hasOutput: boolean;
  onExpand: (lineIndex: number, content: string) => void;
}

function ResultRow({ lineIndex, result, hasOutput, onExpand }: ResultRowProps) {
  if (!hasOutput || !result) {
    return (
      <div
        style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
        className="px-3"
      />
    );
  }

  if (result.isError) {
    const errText = result.errorMsg ?? 'Unknown error';
    const errLines = errText.split('\n');
    const shortErr = errLines[errLines.length - 1] || errLines[0];
    return (
      <div
        style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
        className="px-3 result-row-enter flex items-center gap-1 cursor-pointer group"
        onClick={() => onExpand(lineIndex, errText)}
        title="点击查看完整错误"
      >
        <span className="text-[11px] shrink-0" style={{ color: 'oklch(0.70 0.19 15)' }}>⚠</span>
        <span
          className="text-[12px] truncate flex-1"
          style={{ fontFamily: 'var(--font-mono)', color: 'oklch(0.70 0.19 15)' }}
        >
          {shortErr}
        </span>
        {errLines.length > 1 && (
          <ChevronDown
            size={10}
            className="shrink-0 opacity-50 group-hover:opacity-100"
            style={{ color: 'oklch(0.70 0.19 15)' }}
          />
        )}
      </div>
    );
  }

  const display = result.stdout ? result.stdout : result.value ?? '';

  if (!display) {
    return (
      <div
        style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
        className="px-3"
      />
    );
  }

  const lines = display.split('\n');
  const firstLine = lines[0];
  const hasMore = lines.length > 1;
  const isStdout = !!result.stdout;

  return (
    <div
      style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
      className={`px-3 result-row-enter flex items-center gap-1.5 ${hasMore ? 'cursor-pointer group' : ''}`}
      onClick={hasMore ? () => onExpand(lineIndex, display) : undefined}
      title={hasMore ? '点击查看完整输出' : undefined}
    >
      <span
        className="text-[11px] select-none shrink-0"
        style={{ color: 'oklch(0.35 0.01 265)' }}
      >
        ▸
      </span>
      <span
        className={`text-[13px] truncate flex-1 ${isStdout ? 'text-[#cdd6f4]' : 'text-[#a6e3a1]'}`}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {firstLine}
      </span>
      {hasMore && (
        <span
          className="text-[10px] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ color: 'oklch(0.62 0.02 265)' }}
        >
          +{lines.length - 1}行
        </span>
      )}
    </div>
  );
}

