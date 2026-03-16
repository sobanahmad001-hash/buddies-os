'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { DollarSign, MessageSquare } from 'lucide-react';

interface UsageSummary {
  today_cost: number;
  month_cost: number;
  today_messages: number;
  month_messages: number;
}

export default function TokenCounter() {
  const [summary, setSummary] = useState<UsageSummary>({
    today_cost: 0,
    month_cost: 0,
    today_messages: 0,
    month_messages: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/ai/usage');
      const data = await res.json();
      setSummary(data.summary);
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 bg-zinc-900 border-zinc-800">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-zinc-800 rounded w-20"></div>
          <div className="h-8 bg-zinc-800 rounded"></div>
        </div>
      </Card>
    );
  }

  const budgetPercent = (summary.month_cost / 50) * 100;

  return (
    <Card className="p-4 bg-zinc-900 border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">AI Usage</h3>
        <DollarSign className="w-4 h-4 text-zinc-500" />
      </div>
      
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-zinc-400">Today</span>
            <span className="font-mono">${summary.today_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">{summary.today_messages} messages</span>
            <MessageSquare className="w-3 h-3 text-zinc-600" />
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-800">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-zinc-400">This Month</span>
            <span className="font-mono font-medium">${summary.month_cost.toFixed(2)}</span>
          </div>
          
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-1">
            <div 
              className={`h-1.5 rounded-full transition-all ${
                budgetPercent > 80 ? 'bg-red-500' : budgetPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">{summary.month_messages} messages</span>
            <span className={`text-xs ${budgetPercent > 80 ? 'text-red-400' : 'text-zinc-500'}`}>
              {budgetPercent.toFixed(0)}% of budget
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
