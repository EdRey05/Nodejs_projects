import type { Transaction, AssetCategory } from './types';
import { calculatePortfolio, normalizeAssetTransactions, type AllocationCategory } from './portfolio';
import { addMonths, format, startOfMonth, isBefore, parseISO, isSameMonth, isSameYear, isAfter } from 'date-fns';

export const calculateBalance = (transactions: Transaction[]): number => {
  if (transactions.some(txn => txn.type === 'buy' || txn.type === 'sell')) return calculatePortfolio(transactions).balance;
  return transactions.reduce((acc, txn) => {
    if (txn.type === 'withdrawal' || txn.type === 'sell') {
      return acc - txn.amount;
    }
    return acc + txn.amount;
  }, 0);
};

export const generateGrowthData = (transactions: Transaction[]) => {
  if (transactions.length === 0) return [];
  const isPortfolio = transactions.some(txn => txn.type === 'buy' || txn.type === 'sell');
  const cashFlows = isPortfolio ? calculatePortfolio(transactions).cashFlows : transactions;

  const monthlyAggregates: { 
    [key: string]: { contributions: number; withdrawals: number; interest: number } 
  } = {};

  cashFlows.forEach(txn => {
    const monthKey = format(parseISO(txn.date), 'yyyy-MM');
    if (!monthlyAggregates[monthKey]) {
      monthlyAggregates[monthKey] = { contributions: 0, withdrawals: 0, interest: 0 };
    }
    if (txn.type === 'contribution' || txn.type === 'buy') {
      monthlyAggregates[monthKey].contributions += txn.amount;
    } else if (txn.type === 'withdrawal' || txn.type === 'sell') {
      monthlyAggregates[monthKey].withdrawals += txn.amount;
    } else if (txn.type === 'interest' || txn.type === 'dividend' || txn.type === 'stock-lending' || txn.type === 'distribution') {
      monthlyAggregates[monthKey].interest += txn.amount;
    }
  });

  const transactionDates = transactions.map(t => parseISO(t.date));
  const chartStartDate = new Date(Math.min.apply(null, transactionDates as any));
  
  const firstMonth = startOfMonth(chartStartDate);
  const lastMonth = startOfMonth(new Date());

  const chartData = [];
  let cumulativeBalance = 0;

  let currentMonth = firstMonth;
  while (isBefore(currentMonth, addMonths(lastMonth, 1))) {
    const monthKey = format(currentMonth, 'yyyy-MM');
    const monthly = monthlyAggregates[monthKey] || { contributions: 0, withdrawals: 0, interest: 0 };
    
    cumulativeBalance = isPortfolio
      ? calculatePortfolio(transactions.filter(txn => parseISO(txn.date) < addMonths(currentMonth, 1))).balance
      : cumulativeBalance + monthly.contributions + monthly.interest - monthly.withdrawals;

    chartData.push({
      month: format(currentMonth, 'MMM yyyy'),
      balance: cumulativeBalance,
      contributions: monthly.contributions,
      withdrawals: monthly.withdrawals,
      interest: monthly.interest,
    });
    
    currentMonth = addMonths(currentMonth, 1);
  }

  return chartData;
};


export const calculateProjectionData = (
  initialBalance: number,
  monthlyContribution: number,
  annualInterestRate: number,
  years: number
) => {
  const data = [];
  let currentBalance = initialBalance;
  const monthlyRate = annualInterestRate / 100 / 12;
  const totalMonths = years * 12;

  const today = new Date();

  for (let i = 0; i <= totalMonths; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    
    const totalContributions = monthlyContribution * i;
    const totalInterest = currentBalance - initialBalance - totalContributions;

    data.push({
      month: format(date, 'MMM yyyy'),
      balance: currentBalance,
      initialBalance: initialBalance,
      totalContributions: totalContributions,
      totalInterest: totalInterest > 0 ? totalInterest : 0,
    });
    
    currentBalance = currentBalance * (1 + monthlyRate) + monthlyContribution;
  }

  return data;
};

export const calculateTransactionSummary = (transactions: Transaction[], now = new Date()) => {
  if (transactions.some(txn => txn.type === 'buy' || txn.type === 'sell')) transactions = calculatePortfolio(transactions).cashFlows;

  const summary = {
    month: { contributions: 0, interest: 0, withdrawals: 0 },
    year: { contributions: 0, interest: 0, withdrawals: 0 },
    allTime: { contributions: 0, interest: 0, withdrawals: 0 },
  };

  if (!transactions || transactions.length === 0) {
    return summary;
  }

  transactions.forEach(txn => {
    const txnDate = parseISO(txn.date);

    // All time totals
    if (txn.type === 'contribution' || txn.type === 'buy') {
      summary.allTime.contributions += txn.amount;
    } else if (txn.type === 'interest' || txn.type === 'dividend' || txn.type === 'stock-lending' || txn.type === 'distribution') {
      summary.allTime.interest += txn.amount;
    } else if (txn.type === 'withdrawal' || txn.type === 'sell') {
      summary.allTime.withdrawals += txn.amount;
    }

    // Current year totals
    if (isSameYear(txnDate, now)) {
      if (txn.type === 'contribution' || txn.type === 'buy') {
        summary.year.contributions += txn.amount;
      } else if (txn.type === 'interest' || txn.type === 'dividend' || txn.type === 'stock-lending' || txn.type === 'distribution') {
        summary.year.interest += txn.amount;
      } else if (txn.type === 'withdrawal' || txn.type === 'sell') {
        summary.year.withdrawals += txn.amount;
      }
    }

    // Current month totals
    if (isSameMonth(txnDate, now)) {
      if (txn.type === 'contribution' || txn.type === 'buy') {
        summary.month.contributions += txn.amount;
      } else if (txn.type === 'interest' || txn.type === 'dividend' || txn.type === 'stock-lending' || txn.type === 'distribution') {
        summary.month.interest += txn.amount;
      } else if (txn.type === 'withdrawal' || txn.type === 'sell') {
        summary.month.withdrawals += txn.amount;
      }
    }
  });

  return summary;
};


export const generateAssetPerformanceData = (transactions: Transaction[]) => {
  transactions = normalizeAssetTransactions(transactions);
  if (transactions.length === 0) {
    return { uniqueAssets: [], monthlyData: [] };
  }

  const sortedTxns = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const uniqueAssetsMap = new Map<string, { assetName: string; hasDividends: boolean }>();
  sortedTxns.forEach(txn => {
    if (txn.assetCode && txn.assetName) {
      if (!uniqueAssetsMap.has(txn.assetCode)) {
        uniqueAssetsMap.set(txn.assetCode, { assetName: txn.assetName, hasDividends: false });
      }
      if ((txn.type === 'dividend' || txn.type === 'stock-lending' || txn.type === 'distribution') && txn.amount > 0) {
        uniqueAssetsMap.get(txn.assetCode)!.hasDividends = true;
      }
    }
  });
  
  const uniqueAssets = Array.from(uniqueAssetsMap.entries()).map(([assetCode, data]) => ({ assetCode, ...data }));
  uniqueAssets.sort((a, b) => a.assetCode.localeCompare(b.assetCode));

  const monthlyData: { month: string; assets: { [assetCode: string]: { investment: number; dividends: number; shares: number; realizedGains: number } } }[] = [];
  const assetState: { [assetCode: string]: { investment: number; dividends: number; shares: number; realizedGains: number } } = {};
  uniqueAssets.forEach(a => {
    assetState[a.assetCode] = { investment: 0, dividends: 0, shares: 0, realizedGains: 0 };
  });

  if (sortedTxns.length === 0) return { uniqueAssets, monthlyData: [] };
  
  const firstTxnDate = parseISO(sortedTxns[0].date);
  let currentMonth = startOfMonth(firstTxnDate);
  const lastTxnDate = parseISO(sortedTxns[sortedTxns.length - 1].date);
  const endOfMonth = startOfMonth(new Date());

  const lastDate = isAfter(lastTxnDate, endOfMonth) ? lastTxnDate : endOfMonth;
  
  let txnIndex = 0;

  while (isBefore(currentMonth, addMonths(startOfMonth(lastDate), 1))) {
    while (txnIndex < sortedTxns.length && isSameMonth(parseISO(sortedTxns[txnIndex].date), currentMonth)) {
      const txn = sortedTxns[txnIndex];
      const code = txn.assetCode;
      if (code && assetState[code]) {
        switch (txn.type) {
          case 'buy':
            assetState[code].investment += txn.amount;
            assetState[code].shares += txn.shares || 0;
            break;
          case 'sell':
            if (assetState[code].shares > 0 && txn.shares && txn.shares > 0 && txn.shares <= assetState[code].shares + 1e-8) {
              const costRemoved = assetState[code].investment * Math.min(1, txn.shares / assetState[code].shares);
              assetState[code].realizedGains += txn.amount - costRemoved;
              assetState[code].investment = Math.max(0, assetState[code].investment - costRemoved);
              assetState[code].shares = Math.max(0, assetState[code].shares - txn.shares);
            }
            break;
          case 'dividend':
          case 'stock-lending':
          case 'distribution':
            assetState[code].dividends += txn.amount;
            break;
        }
      }
      txnIndex++;
    }

    monthlyData.push({
      month: format(currentMonth, 'MMM yyyy'),
      assets: JSON.parse(JSON.stringify(assetState)) // Deep copy
    });

    currentMonth = addMonths(currentMonth, 1);
  }

  return { uniqueAssets, monthlyData };
};


export const calculateAssetAllocation = (transactions: Transaction[]) => {
  const investment = {} as Record<AllocationCategory, number>;
  const gains = {} as Record<AllocationCategory, number>;
  for (const category of ['Stock ETF', 'Individual Stock', 'REIT', 'REIT ETF', 'Uncategorized'] as AllocationCategory[]) {
    investment[category] = 0; gains[category] = 0;
  }
  for (const holding of calculatePortfolio(transactions || []).holdings) {
    investment[holding.category] += holding.cost;
  }
  for (const txn of normalizeAssetTransactions(transactions || [])) {
    if (['dividend', 'stock-lending', 'distribution'].includes(txn.type)) gains[txn.assetCategory || 'Uncategorized'] += txn.amount;
  }
  return { investment, gains };
};
