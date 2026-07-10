/**
 * VariablePanel — 实时变量侧边栏
 * 显示当前 Python 命名空间中的所有用户定义变量。
 * Design: Dark IDE Aesthetic — Catppuccin Mocha palette
 */
import { VarInfo } from '@/lib/pyodideEngine';

const TYPE_COLORS: Record<string, string> = {
  int:       'text-[#89b4fa]',
  float:     'text-[#89dceb]',
  complex:   'text-[#cba6f7]',
  str:       'text-[#a6e3a1]',
  bool:      'text-[#fab387]',
  list:      'text-[#f9e2af]',
  tuple:     'text-[#f9e2af]',
  dict:      'text-[#f9e2af]',
  set:       'text-[#f9e2af]',
  ndarray:   'text-[#89dceb]',
  DataFrame: 'text-[#89dceb]',
  Series:    'text-[#89dceb]',
  NoneType:  'text-[#6c7086]',
};

function typeColor(t: string) {
  return TYPE_COLORS[t] ?? 'text-[#cdd6f4]';
}

interface VariablePanelProps {
  variables: VarInfo[];
  isRunning: boolean;
}

const SKELETON_VARS = [
  { name: 'x', type: 'int', val: '—' },
  { name: 'result', type: 'float', val: '—' },
  { name: 'data', type: 'list', val: '—' },
];

export default function VariablePanel({ variables, isRunning }: VariablePanelProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: 'oklch(0.145 0.016 265)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'oklch(1 0 0 / 8%)' }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(0.45 0.01 265)', fontFamily: 'var(--font-mono)' }}
        >
          变量
        </span>
        {variables.length > 0 && (
          <span
            className="ml-auto text-[10px] rounded px-1.5 py-0.5"
            style={{
              color: 'oklch(0.72 0.14 265)',
              background: 'oklch(0.72 0.14 265 / 12%)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {variables.length}
          </span>
        )}
      </div>

      {/* Variable list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {variables.length === 0 ? (
          <div className="px-2 pt-2">
            {/* Skeleton placeholder cards */}
            {SKELETON_VARS.map((ph) => (
              <div
                key={ph.name}
                className="my-0.5 rounded px-2 py-1.5 border opacity-20"
                style={{ background: 'oklch(0.20 0.018 265)', borderColor: 'oklch(1 0 0 / 8%)' }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[13px] font-semibold text-[#cdd6f4]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {ph.name}
                  </span>
                  <span
                    className="text-[10px] px-1 rounded-sm border border-white/10 text-[#89b4fa]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {ph.type}
                  </span>
                </div>
                <div
                  className="text-[11px] text-[#a6adc8]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {ph.val}
                </div>
              </div>
            ))}
            <div
              className="mt-3 text-center text-[10px]"
              style={{ color: 'oklch(0.40 0.01 265)' }}
            >
              {isRunning ? (
                <span style={{ color: 'oklch(0.72 0.14 265)' }}>执行中…</span>
              ) : (
                <span>按 Shift+Enter 运行后显示</span>
              )}
            </div>
          </div>
        ) : (
          variables.map((v) => <VarCard key={v.name} v={v} />)
        )}
      </div>
    </div>
  );
}

function VarCard({ v }: { v: VarInfo }) {
  const isLong = v.value.length > 40 || v.value.includes('\n');

  return (
    <div
      className={`mx-2 my-0.5 rounded px-2 py-1.5 border border-white/5 transition-colors ${v.updated ? 'var-updated' : ''}`}
      style={{ background: 'oklch(0.20 0.018 265)' }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="text-[13px] font-semibold text-[#cdd6f4]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {v.name}
        </span>
        <span
          className={`text-[10px] px-1 rounded-sm border border-white/10 ${typeColor(v.type)}`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {v.type}
        </span>
      </div>
      <div
        className={`text-[11px] text-[#a6adc8] break-all leading-relaxed ${isLong ? 'line-clamp-4' : ''}`}
        style={{ fontFamily: 'var(--font-mono)', whiteSpace: isLong ? 'pre-wrap' : 'normal' }}
        title={v.value}
      >
        {v.value}
      </div>
    </div>
  );
}
