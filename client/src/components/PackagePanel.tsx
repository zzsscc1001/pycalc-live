/**
 * PackagePanel — 可用 Python 包浏览器
 * 列出 Pyodide 内置包，支持搜索过滤，点击插入 import 语句
 * Design: Light IDE Aesthetic — GitHub Light inspired
 */
import { useState, useMemo } from 'react';
import { Search, Package, X, ChevronDown, ChevronRight } from 'lucide-react';
import { PYODIDE_PACKAGES, PackageInfo } from '@/lib/pyodideEngine';

interface PackagePanelProps {
  onInsertImport: (importStatement: string) => void;
  onClose: () => void;
}

const CATEGORY_ORDER = ['标准库', '数学/科学', '数据处理', '可视化', '机器学习'];

type GroupedEntry = [string, PackageInfo[]];

export default function PackagePanel({ onInsertImport, onClose }: PackagePanelProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo((): PackageInfo[] => {
    const q = query.toLowerCase().trim();
    if (!q) return PYODIDE_PACKAGES;
    return PYODIDE_PACKAGES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo((): GroupedEntry[] => {
    const map: Record<string, PackageInfo[]> = {};
    for (const pkg of filtered) {
      if (!map[pkg.category]) map[pkg.category] = [];
      map[pkg.category].push(pkg);
    }
    const result: GroupedEntry[] = [];
    for (const cat of CATEGORY_ORDER) {
      if (map[cat]) result.push([cat, map[cat]]);
    }
    // Any remaining categories not in CATEGORY_ORDER
    for (const cat of Object.keys(map)) {
      if (!CATEGORY_ORDER.includes(cat)) result.push([cat, map[cat]]);
    }
    return result;
  }, [filtered]);

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toolbarBorder = 'rgba(0,0,0,0.08)';
  const textMuted = '#57606a';
  const textDim = '#8c959f';
  const primaryColor = '#0550ae';

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#ffffff', borderLeft: `1px solid ${toolbarBorder}` }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: toolbarBorder, background: '#f6f8fa' }}
      >
        <Package size={13} style={{ color: primaryColor }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest flex-1" style={{ color: textDim }}>
          可用包
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors hover:bg-black/5"
          style={{ color: textMuted }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b shrink-0" style={{ borderColor: toolbarBorder }}>
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded"
          style={{ background: '#f6f8fa', border: `1px solid ${toolbarBorder}` }}
        >
          <Search size={11} style={{ color: textDim }} />
          <input
            type="text"
            placeholder="搜索包名或描述…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[12px]"
            style={{ color: '#24292f', fontFamily: 'var(--font-mono)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-0.5" style={{ color: textDim }}>
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Package list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Package size={20} style={{ color: textDim }} />
            <span className="text-[11px]" style={{ color: textDim }}>未找到匹配的包</span>
          </div>
        )}
        {grouped.map(([cat, pkgs]) => (
          <div key={cat}>
            <button
              className="w-full flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-black/3"
              style={{ borderBottom: `1px solid ${toolbarBorder}` }}
              onClick={() => toggleCategory(cat)}
            >
              {collapsed.has(cat)
                ? <ChevronRight size={10} style={{ color: textDim }} />
                : <ChevronDown size={10} style={{ color: textDim }} />
              }
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textDim }}>
                {cat}
              </span>
              <span
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(5,80,174,0.08)', color: primaryColor }}
              >
                {pkgs.length}
              </span>
            </button>

            {!collapsed.has(cat) && pkgs.map((pkg) => (
              <PackageItem
                key={pkg.name}
                pkg={pkg}
                onInsert={() => pkg.importAs && onInsertImport(pkg.importAs)}
              />
            ))}
          </div>
        ))}

        <div className="px-3 py-3 mt-2">
          <p className="text-[10px] leading-relaxed" style={{ color: textDim }}>
            点击包名将 import 语句插入到编辑器末尾。
            标准库无需安装，其他包首次使用时自动从 CDN 加载（需联网）。
          </p>
        </div>
      </div>
    </div>
  );
}

function PackageItem({ pkg, onInsert }: { pkg: PackageInfo; onInsert: () => void }) {
  const primaryColor = '#0550ae';
  const textMuted = '#57606a';

  return (
    <button
      className="w-full flex flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-blue-50/60 group"
      style={{ borderBottom: `1px solid rgba(0,0,0,0.04)` }}
      onClick={onInsert}
      title={pkg.importAs ? `插入: ${pkg.importAs}` : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[12px] font-semibold group-hover:text-blue-700 transition-colors"
          style={{ fontFamily: 'var(--font-mono)', color: primaryColor }}
        >
          {pkg.name}
        </span>
        {pkg.importAs && (
          <span
            className="text-[9px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(5,80,174,0.1)', color: primaryColor }}
          >
            插入
          </span>
        )}
      </div>
      <span className="text-[11px] leading-snug" style={{ color: textMuted }}>
        {pkg.description}
      </span>
      {pkg.importAs && (
        <span
          className="text-[10px] mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity truncate"
          style={{ fontFamily: 'var(--font-mono)', color: '#57606a' }}
        >
          {pkg.importAs}
        </span>
      )}
    </button>
  );
}
