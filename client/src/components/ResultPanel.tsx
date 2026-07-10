/**
 * ResultPanel — 逐行结果输出面板
 * 与代码编辑器行高严格对齐（22px/行），自动显示表达式值和 print() 输出。
 * 支持 matplotlib 图表内嵌显示（plotSvg 字段）。
 * Design: Light IDE Aesthetic — GitHub Light inspired
 */
import { useState, useCallback } from 'react';
import { LineResult } from '@/lib/pyodideEngine';
import { X, ChevronDown, Maximize2 } from 'lucide-react';

const LINE_HEIGHT = 22; // px — must match CSS --line-height-code

interface ResultPanelProps {
  lineResults: LineResult[];
  totalLines: number;
  scrollTop: number;
  hoveredLine: number | null;
  onHoverLine: (line: number | null) => void;
}

export default function ResultPanel({
  lineResults,
  totalLines,
  scrollTop,
  hoveredLine,
  onHoverLine,
}: ResultPanelProps) {
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState('');
  const [expandedIsPlot, setExpandedIsPlot] = useState(false);

  const resultMap = new Map<number, LineResult>();
  for (const r of lineResults) {
    resultMap.set(r.lineIndex, r);
  }

  const handleExpand = useCallback((lineIndex: number, content: string, isPlot = false) => {
    setExpandedLine(lineIndex);
    setExpandedContent(content);
    setExpandedIsPlot(isPlot);
  }, []);

  const hasResults = lineResults.length > 0;

  // Calculate total height including plot rows
  const rowHeights: number[] = [];
  for (let i = 0; i < totalLines; i++) {
    const r = resultMap.get(i);
    if (r?.plotSvg) {
      rowHeights.push(180); // plot row height
    } else {
      rowHeights.push(LINE_HEIGHT);
    }
  }

  // Calculate cumulative offsets
  const offsets: number[] = [];
  let cumulative = 0;
  for (const h of rowHeights) {
    offsets.push(cumulative);
    cumulative += h;
  }

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: '#f6f8fa' }}
    >
      {/* Subtle row-stripe rhythm hint before execution */}
      {!hasResults && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: LINE_HEIGHT,
                background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent',
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
            const hasOutput = r && (r.value !== null || r.stdout || r.isError || r.plotSvg);
            const isHovered = hoveredLine === i;
            return (
              <ResultRow
                key={i}
                lineIndex={i}
                result={r}
                hasOutput={!!hasOutput}
                isHovered={isHovered}
                onExpand={handleExpand}
                onMouseEnter={() => onHoverLine(i)}
                onMouseLeave={() => onHoverLine(null)}
              />
            );
          })}
        </div>
      </div>

      {/* Expanded output modal */}
      {expandedLine !== null && (
        <div
          className="absolute inset-0 z-10 flex flex-col"
          style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)' }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b shrink-0"
            style={{ borderColor: 'rgba(0,0,0,0.08)', background: '#f6f8fa' }}
          >
            <span
              className="text-[11px] font-semibold"
              style={{ color: '#57606a', fontFamily: 'var(--font-mono)' }}
            >
              第 {expandedLine + 1} 行{expandedIsPlot ? '图表' : '完整输出'}
            </span>
            <button
              onClick={() => setExpandedLine(null)}
              className="p-1 rounded transition-colors hover:bg-black/5"
              style={{ color: '#57606a' }}
            >
              <X size={13} />
            </button>
          </div>
          {expandedIsPlot ? (
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
              <img
                src={expandedContent}
                alt="matplotlib plot"
                className="max-w-full max-h-full object-contain rounded"
                style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}
              />
            </div>
          ) : (
            <pre
              className="flex-1 overflow-auto p-3 text-[12px] leading-relaxed"
              style={{
                fontFamily: 'var(--font-mono)',
                color: '#24292f',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {expandedContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

interface ResultRowProps {
  lineIndex: number;
  result?: LineResult;
  hasOutput: boolean;
  isHovered: boolean;
  onExpand: (lineIndex: number, content: string, isPlot?: boolean) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ResultRow({ lineIndex, result, hasOutput, isHovered, onExpand, onMouseEnter, onMouseLeave }: ResultRowProps) {
  // Plot row: taller, shows thumbnail
  if (result?.plotSvg) {
    return (
      <div
        style={{
          height: 180,
          borderLeft: isHovered ? '2px solid #0550ae' : '2px solid transparent',
          background: isHovered ? 'rgba(5,80,174,0.03)' : 'rgba(0,0,0,0.01)',
          paddingLeft: isHovered ? '10px' : '12px',
          transition: 'background 120ms ease, border-color 120ms ease',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingRight: 8,
          cursor: 'pointer',
        }}
        className="group"
        onClick={() => onExpand(lineIndex, result.plotSvg!, true)}
        title="点击查看大图"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <img
          src={result.plotSvg}
          alt="plot"
          style={{
            height: 160,
            maxWidth: '85%',
            objectFit: 'contain',
            borderRadius: 4,
            border: '1px solid rgba(0,0,0,0.08)',
            background: '#fff',
          }}
        />
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 size={12} style={{ color: '#57606a' }} />
          <span className="text-[9px]" style={{ color: '#8c959f' }}>放大</span>
        </div>
      </div>
    );
  }

  const baseStyle: React.CSSProperties = {
    height: LINE_HEIGHT,
    lineHeight: `${LINE_HEIGHT}px`,
    transition: 'background 120ms ease, border-color 120ms ease',
    borderLeft: isHovered ? '2px solid #0550ae' : '2px solid transparent',
    background: isHovered ? 'rgba(5,80,174,0.05)' : 'transparent',
    paddingLeft: isHovered ? '10px' : '12px',
  };

  if (!hasOutput || !result) {
    return (
      <div
        style={baseStyle}
        className="pr-3"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  }

  if (result.isError) {
    const errText = result.errorMsg ?? 'Unknown error';
    const errLines = errText.split('\n');
    const shortErr = errLines[errLines.length - 1] || errLines[0];
    return (
      <div
        style={{
          ...baseStyle,
          borderLeft: isHovered ? '2px solid #cf222e' : '2px solid #cf222e66',
          background: isHovered ? 'rgba(207,34,46,0.08)' : 'rgba(207,34,46,0.04)',
          paddingLeft: '10px',
        }}
        className="result-row-enter flex items-center gap-1 cursor-pointer group pr-3"
        onClick={() => onExpand(lineIndex, errText)}
        title="点击查看完整错误"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <span className="text-[11px] shrink-0" style={{ color: '#cf222e' }}>⚠</span>
        <span
          className="text-[12px] truncate flex-1"
          style={{ fontFamily: 'var(--font-mono)', color: '#cf222e' }}
        >
          {shortErr}
        </span>
        {errLines.length > 1 && (
          <ChevronDown
            size={10}
            className="shrink-0 opacity-50 group-hover:opacity-100"
            style={{ color: '#cf222e' }}
          />
        )}
      </div>
    );
  }

  const display = result.stdout ? result.stdout : result.value ?? '';
  if (!display) {
    return (
      <div
        style={baseStyle}
        className="pr-3"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  }

  const lines = display.split('\n');
  const firstLine = lines[0];
  const hasMore = lines.length > 1;
  const isStdout = !!result.stdout;
  const isAssignment = result.isAssignment;

  return (
    <div
      style={baseStyle}
      className={`result-row-enter flex items-center gap-1.5 pr-3 ${hasMore ? 'cursor-pointer group' : ''}`}
      onClick={hasMore ? () => onExpand(lineIndex, display) : undefined}
      title={hasMore ? '点击查看完整输出' : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        className="text-[11px] select-none shrink-0"
        style={{ color: isHovered ? '#0550ae' : '#8c959f' }}
      >
        {isAssignment ? '=' : '▸'}
      </span>
      <span
        className="text-[13px] truncate flex-1"
        style={{
          fontFamily: 'var(--font-mono)',
          color: isStdout ? '#24292f' : isAssignment ? '#0550ae' : '#1a7f37',
          fontWeight: isAssignment ? '500' : 'normal',
        }}
      >
        {firstLine}
      </span>
      {hasMore && (
        <span
          className="text-[10px] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ color: '#57606a' }}
        >
          +{lines.length - 1}行
        </span>
      )}
    </div>
  );
}

