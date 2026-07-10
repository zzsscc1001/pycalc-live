/**
 * VariablePanel — 实时变量侧边栏
 * 显示当前 Python 命名空间中的所有用户定义变量。
 * Design: Light IDE Aesthetic — GitHub Light inspired
 */
import { VarInfo } from '@/lib/pyodideEngine';

const TYPE_COLORS: Record<string, string> = {
  int:       '#0550ae',
  float:     '#0969da',
  complex:   '#8250df',
  str:       '#1a7f37',
  bool:      '#953800',
  list:      '#6e7781',
  tuple:     '#6e7781',
  dict:      '#6e7781',
  set:       '#6e7781',
  ndarray:   '#0969da',
  DataFrame: '#0969da',
  Series:    '#0969da',
  NoneType:  '#8c959f',
};

function typeColor(t: string) {
  return TYPE_COLORS[t] ?? '#57606a';
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
    <div className="flex flex-col h-full" style={{ background: '#f6f8fa' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'rgba(0,0,0,0.08)' }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#57606a', fontFamily: 'var(--font-mono)' }}
        >
          变量
        </span>
        {variables.length > 0 && (
          <span
            className="ml-auto text-[10px] rounded px-1.5 py-0.5"
            style={{
              color: '#0550ae',
              background: 'rgba(5,80,174,0.08)',
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
            {SKELETON_VARS.map((ph) => (
              <div
                key={ph.name}
                className="my-0.5 rounded px-2 py-1.5 border opacity-30"
                style={{ background: '#ffffff', borderColor: 'rgba(0,0,0,0.08)' }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ fontFamily: 'var(--font-mono)', color: '#24292f' }}
                  >
                    {ph.name}
                  </span>
                  <span
                    className="text-[10px] px-1 rounded-sm border"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: '#0550ae',
                      borderColor: 'rgba(5,80,174,0.2)',
                    }}
                  >
                    {ph.type}
                  </span>
                </div>
                <div
                  className="text-[11px]"
                  style={{ fontFamily: 'var(--font-mono)', color: '#57606a' }}
                >
                  {ph.val}
                </div>
              </div>
            ))}
            <div
              className="mt-3 text-center text-[10px]"
              style={{ color: '#8c959f' }}
            >
              {isRunning ? (
                <span style={{ color: '#0550ae' }}>执行中…</span>
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
      className={`mx-2 my-0.5 rounded px-2 py-1.5 border transition-all ${v.updated ? 'var-updated' : ''}`}
      style={{ background: '#ffffff', borderColor: 'rgba(0,0,0,0.08)' }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="text-[13px] font-semibold"
          style={{ fontFamily: 'var(--font-mono)', color: '#24292f' }}
        >
          {v.name}
        </span>
        <span
          className="text-[10px] px-1 rounded-sm border"
          style={{
            fontFamily: 'var(--font-mono)',
            color: typeColor(v.type),
            borderColor: `${typeColor(v.type)}33`,
          }}
        >
          {v.type}
        </span>
      </div>
      <div
        className={`text-[11px] break-all leading-relaxed ${isLong ? 'line-clamp-4' : ''}`}
        style={{
          fontFamily: 'var(--font-mono)',
          color: '#57606a',
          whiteSpace: isLong ? 'pre-wrap' : 'normal',
        }}
        title={v.value}
      >
        {v.value}
      </div>
    </div>
  );
}

