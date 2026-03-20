'use client';

import { useState, useEffect } from 'react';
import { Search, X, Loader2, Calendar, CheckSquare, AlertCircle, TrendingUp, Smile, Shield, Filter, Download } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'tasks' | 'decisions' | 'updates' | 'behavior_logs' | 'rules';
type DateRange = 'all' | 'today' | 'last_week' | 'last_month';

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [intent, setIntent] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [selectedResult, setSelectedResult] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setIntent('');
      setFilterType('all');
      setDateRange('all');
      setSelectedResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSearch = async (overrideQuery?: string, overrideFilter?: FilterType, overrideDate?: DateRange) => {
    const q = overrideQuery ?? query;
    const ft = overrideFilter ?? filterType;
    const dr = overrideDate ?? dateRange;
    if (!q.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          filterType: ft !== 'all' ? ft : undefined,
          dateRange: dr !== 'all' ? dr : undefined,
        }),
      });

      const data = await response.json();
      setResults(data.results || []);
      setIntent(data.intent || '');
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search when filters change (only if there's already a query)
  useEffect(() => {
    if (query.trim()) {
      handleSearch(query, filterType, dateRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, dateRange]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'task': return <CheckSquare className="w-4 h-4" />;
      case 'decision': return <Calendar className="w-4 h-4" />;
      case 'update': return <TrendingUp className="w-4 h-4" />;
      case 'behavior_log': return <Smile className="w-4 h-4" />;
      case 'rule': return <Shield className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatResult = (item: any) => {
    switch (item._type) {
      case 'task':
        return {
          title: item.title,
          subtitle: `${item.status} · ${item.projects?.name || 'No project'}`,
          badge: 'Task',
          color: 'blue',
        };
      case 'decision':
        return {
          title: item.context || item.decision,
          subtitle: `${item.verdict} · ${item.probability != null ? item.probability + '%' : '?%'} · ${item.projects?.name || 'No project'}`,
          badge: 'Decision',
          color: 'purple',
        };
      case 'update':
        return {
          title: item.content,
          subtitle: `${item.update_type} · ${item.projects?.name || 'No project'}`,
          badge: 'Update',
          color: 'green',
        };
      case 'behavior_log':
        return {
          title: `Mood: ${item.mood_tag || 'N/A'} · Stress: ${item.stress ?? 'N/A'}`,
          subtitle: new Date(item.timestamp || item.created_at).toLocaleDateString(),
          badge: 'Behavior',
          color: 'yellow',
        };
      case 'rule':
        return {
          title: item.rule_text,
          subtitle: `Severity ${item.severity}`,
          badge: 'Rule',
          color: 'red',
        };
      default:
        return { title: 'Unknown', subtitle: '', badge: 'Item', color: 'gray' };
    }
  };

  const exportResults = () => {
    const csv = results.map(item => {
      const f = formatResult(item);
      return `"${f.badge}","${(f.title ?? '').replace(/"/g, '""')}","${(f.subtitle ?? '').replace(/"/g, '""')}"`;
    }).join('\n');
    const blob = new Blob([`Type,Title,Details\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-results-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredResults = results.filter(item => {
    if (filterType === 'all') return true;
    const map: Record<string, string> = { behavior_logs: 'behavior_log', tasks: 'task', decisions: 'decision', updates: 'update', rules: 'rule' };
    return item._type === (map[filterType] ?? filterType);
  });

  if (!isOpen) return null;

  const colorClasses: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    green:  'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl bg-[#F7F5F2] rounded-xl shadow-2xl overflow-hidden">

        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-[#E5E2DE] bg-white">
          <Search className="w-5 h-5 text-[#B0ADA9] flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={`Try "Show REL blockers" or "decisions I'm waiting on"`}
            className="flex-1 bg-transparent text-[#0F0F0F] placeholder-[#B0ADA9] focus:outline-none text-[15px]"
            autoFocus
          />
          {isSearching ? (
            <Loader2 className="w-5 h-5 text-[#B5622A] animate-spin flex-shrink-0" />
          ) : (
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#F0EDE9] rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-[#B0ADA9]" />
            </button>
          )}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E2DE] bg-[#F7F5F2] overflow-x-auto">
          <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
            <Filter className="w-3.5 h-3.5 text-[#B0ADA9]" />
            <span className="text-[11px] font-medium text-[#B0ADA9] uppercase tracking-wide">Type</span>
          </div>
          {(['all', 'tasks', 'decisions', 'updates', 'behavior_logs', 'rules'] as FilterType[]).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap font-medium ${
                filterType === type
                  ? 'bg-[#B5622A] text-white'
                  : 'bg-white text-[#5C5855] hover:bg-[#F0EDE9] border border-[#E5E2DE]'
              }`}
            >
              {type === 'all' ? 'All' : type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E5E2DE] bg-[#F7F5F2] overflow-x-auto">
          <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#B0ADA9]" />
            <span className="text-[11px] font-medium text-[#B0ADA9] uppercase tracking-wide">Date</span>
          </div>
          {(['all', 'today', 'last_week', 'last_month'] as DateRange[]).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap font-medium ${
                dateRange === range
                  ? 'bg-[#B5622A] text-white'
                  : 'bg-white text-[#5C5855] hover:bg-[#F0EDE9] border border-[#E5E2DE]'
              }`}
            >
              {range === 'all' ? 'All Time' : range.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* AI Intent Banner */}
        {intent && (
          <div className="px-4 py-2 bg-orange-50 border-b border-orange-100">
            <p className="text-[13px] text-orange-700">
              💡 <span className="font-medium">Understanding:</span> {intent}
            </p>
          </div>
        )}

        {/* Results Header */}
        {filteredResults.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#E5E2DE] bg-white">
            <span className="text-[13px] text-[#B0ADA9]">
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={exportResults}
              className="flex items-center gap-1.5 px-3 py-1 text-[11px] bg-[#F0EDE9] hover:bg-[#E5E2DE] rounded-lg transition-colors text-[#5C5855] font-medium"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto">
          {filteredResults.length === 0 && !isSearching && query && (
            <div className="p-8 text-center text-[#B0ADA9] text-[13px]">
              No results found. Try a different search or filter.
            </div>
          )}

          {filteredResults.length === 0 && !query && (
            <div className="p-8 text-center">
              <p className="text-[13px] text-[#B0ADA9] mb-4">Try searching for:</p>
              <div className="space-y-2">
                {[
                  'Show REL blockers',
                  "What decisions am I waiting on?",
                  'Show tasks for CRM',
                  'My stress logs last week',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setQuery(suggestion); handleSearch(suggestion); }}
                    className="block mx-auto px-4 py-2 bg-white border border-[#E5E2DE] rounded-xl hover:bg-[#F0EDE9] text-[13px] text-[#3A3835] transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredResults.map((item, index) => {
            const formatted = formatResult(item);
            return (
              <div
                key={index}
                onClick={() => setSelectedResult(item)}
                className="p-4 border-b border-[#E5E2DE] hover:bg-white transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-[#B0ADA9] flex-shrink-0">
                    {getIcon(item._type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colorClasses[formatted.color] ?? colorClasses.gray}`}>
                        {formatted.badge}
                      </span>
                      {(item.created_at || item.timestamp) && (
                        <span className="text-[11px] text-[#B0ADA9]">
                          {new Date(item.created_at || item.timestamp).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-[#0F0F0F] truncate">
                      {formatted.title}
                    </p>
                    <p className="text-[11px] text-[#B0ADA9] mt-0.5">
                      {formatted.subtitle}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Result Detail Modal */}
      {selectedResult && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSelectedResult(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setSelectedResult(null)}
              className="absolute top-4 right-4 p-1 hover:bg-[#F0EDE9] rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-[#B0ADA9]" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colorClasses[formatResult(selectedResult).color] ?? colorClasses.gray}`}>
                {formatResult(selectedResult).badge}
              </span>
              <h3 className="text-[15px] font-semibold text-[#0F0F0F]">
                Details
              </h3>
            </div>
            <pre className="text-[11px] text-[#5C5855] whitespace-pre-wrap bg-[#F7F5F2] rounded-xl p-3 overflow-x-auto">
              {JSON.stringify(
                Object.fromEntries(Object.entries(selectedResult).filter(([k]) => k !== '_type')),
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
