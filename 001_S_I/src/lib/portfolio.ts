import type { AssetCategory, Transaction } from './types';

export type AllocationCategory = AssetCategory | 'Uncategorized';
export const assetCategories: AssetCategory[] = ['Stock ETF', 'Individual Stock', 'REIT', 'REIT ETF'];

export function inferAssetCategory(name = '', code = ''): AssetCategory | undefined {
  const text = name.toUpperCase();
  const reit = /REIT|REAL ESTATE INVESTMENT TRUST|REALTY INCOME/.test(text) || code.toUpperCase() === 'O';
  const etf = /\bETF\b|EXCHANGE.TRADED FUND/.test(text) || ['VTI', 'VOO', 'VT', 'VNQ'].includes(code.toUpperCase());
  if (reit && etf) return 'REIT ETF';
  if (reit) return 'REIT';
  if (etf) return code.toUpperCase() === 'VNQ' ? 'REIT ETF' : 'Stock ETF';
  return name.trim() ? 'Individual Stock' : undefined;
}

function validCategory(value: unknown): AssetCategory | undefined {
  return typeof value === 'string'
    ? assetCategories.find(category => category.toLowerCase() === value.trim().toLowerCase())
    : undefined;
}

// Legacy workbooks omitted categories; income rows may also omit asset names.
// Resolve metadata across the whole account, with explicit categories winning.
export function normalizeAssetTransactions(transactions: Transaction[]): Transaction[] {
  const metadata = new Map<string, { name: string; category?: AssetCategory }>();
  const key = (txn: Transaction) => `${txn.accountId}:${txn.assetCode?.trim().toUpperCase()}`;
  for (const txn of transactions) {
    if (!txn.assetCode?.trim()) continue;
    const prior = metadata.get(key(txn));
    metadata.set(key(txn), {
      name: txn.assetName?.trim() || prior?.name || '',
      category: validCategory(txn.assetCategory) || prior?.category,
    });
  }
  return transactions.map(txn => {
    if (!txn.assetCode?.trim()) return txn;
    const code = txn.assetCode.trim().toUpperCase();
    const asset = metadata.get(key(txn))!;
    return { ...txn, assetCode: code, assetName: txn.assetName?.trim() || asset.name,
      assetCategory: asset.category || inferAssetCategory(asset.name, code) };
  });
}

export type Holding = {
  assetCode: string; assetName: string; category: AllocationCategory;
  shares: number; cost: number; income: number;
};

export function calculatePortfolio(transactions: Transaction[]) {
  const ordered = normalizeAssetTransactions(transactions).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const positions = new Map<string, Holding>();
  const cashFlows: Transaction[] = [];
  const legacyFunding = !ordered.some(txn => txn.type === 'contribution');
  let cash = 0, income = 0, realizedGain = 0, inferredFunding = 0;
  let incompleteTrades = false;
  for (const txn of ordered) {
    let holding: Holding | undefined;
    if (txn.assetCode) {
      if (!positions.has(txn.assetCode)) positions.set(txn.assetCode, {
        assetCode: txn.assetCode, assetName: txn.assetName || txn.assetCode,
        category: txn.assetCategory || 'Uncategorized', shares: 0, cost: 0, income: 0,
      });
      holding = positions.get(txn.assetCode)!;
    }
    if (txn.type === 'contribution') { cash += txn.amount; cashFlows.push(txn); }
    else if (txn.type === 'withdrawal') { cash -= txn.amount; cashFlows.push(txn); }
    else if (txn.type === 'buy') {
      if (legacyFunding && cash < txn.amount) {
        const amount = txn.amount - cash;
        inferredFunding += amount; cash += amount;
        cashFlows.push({ id: `inferred_${txn.id}`, accountId: txn.accountId, type: 'contribution', amount, date: txn.date });
      }
      cash -= txn.amount;
      if (holding) { holding.cost += txn.amount; holding.shares += txn.shares || 0; }
      if (!holding || !txn.shares || txn.shares <= 0) incompleteTrades = true;
    } else if (txn.type === 'sell') {
      cash += txn.amount;
      if (holding && txn.shares && txn.shares > 0 && txn.shares <= holding.shares + 1e-8) {
        const costRemoved = holding.cost * Math.min(1, txn.shares / holding.shares);
        holding.cost = Math.max(0, holding.cost - costRemoved);
        holding.shares = Math.max(0, holding.shares - txn.shares);
        realizedGain += txn.amount - costRemoved;
      } else { incompleteTrades = true; }
    } else {
      cash += txn.amount; income += txn.amount; cashFlows.push(txn);
      if (holding) holding.income += txn.amount;
    }
  }
  const holdings = [...positions.values()];
  const investedCost = holdings.reduce((sum, holding) => sum + holding.cost, 0);
  return { cash, investedCost, balance: cash + investedCost, income, realizedGain,
    holdings, cashFlows, inferredFunding, incompleteTrades };
}
