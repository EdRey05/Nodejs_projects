const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const XLSX = require('xlsx');

// Exercise the actual TypeScript calculation modules without introducing a test runner.
const cache = new Map();
function load(name) {
  const filename = path.resolve(__dirname, '../src/lib', `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = id => id.startsWith('./') ? load(id.slice(2)) : originalRequire(id);
  cache.set(filename, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
  return mod.exports;
}
const { calculatePortfolio, normalizeAssetTransactions } = load('portfolio');
const { calculateBalance, calculateAssetAllocation, calculateTransactionSummary, generateGrowthData, calculateProjectionData, generateAssetPerformanceData } = load('calculations');
const close = (actual, expected, tolerance = .011) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const tx = (type, amount, extra = {}) => ({ id: `${type}_${amount}`, accountId: 'test', type, amount, date: '2026-01-02', ...extra });
const asset = { assetCode: 'VTI', assetName: 'Total Stock Market ETF', shares: 10 };

test('deposits fund trades; sales remove average cost and retain proceeds in cash', () => {
  const rows = [tx('contribution', 1000), tx('buy', 800, asset), tx('sell', 500, { ...asset, shares: 5 }), tx('dividend', 20, { assetCode: 'VTI' }), tx('withdrawal', 100)];
  const p = calculatePortfolio(rows);
  close(p.cash, 620); close(p.investedCost, 400); close(p.balance, 1020); close(p.realizedGain, 100);
  close(calculateBalance(rows), 1020);
  assert.equal(p.incompleteTrades, false);
  const summary = calculateTransactionSummary(rows, new Date('2026-01-31'));
  assert.deepEqual(summary.allTime, { contributions: 1000, withdrawals: 100, interest: 20 });
  close(generateGrowthData(rows).at(-1).balance, 1020);
  close(calculateAssetAllocation(rows).investment['Stock ETF'], 400);
});

test('full liquidation leaves cash and no phantom holdings', () => {
  const p = calculatePortfolio([tx('contribution', 1000), tx('buy', 800, asset), tx('sell', 900, asset)]);
  close(p.balance, 1100); close(p.investedCost, 0); close(p.holdings[0].shares, 0);
});

test('realized trade chart reconciles average-cost profits and losses, excluding payouts', () => {
  const rows = [tx('contribution', 1000), tx('buy', 800, asset), tx('dividend', 20, asset), tx('sell', 500, { ...asset, shares: 5 }), tx('sell', 300, { ...asset, shares: 5 })];
  const points = generateAssetPerformanceData(rows).monthlyData;
  const last = points.at(-1).assets.VTI;
  close(last.realizedGains, 0); close(last.investment, 0); close(last.dividends, 20);
  close(last.realizedGains, calculatePortfolio(rows).realizedGain);
  const profit = generateAssetPerformanceData(rows.slice(0, -1)).monthlyData.at(-1).assets.VTI;
  close(profit.realizedGains, 100); close(profit.investment, 400);
});

test('projection compounds monthly with end-of-month contributions and reconciled breakdown', () => {
  const zero = calculateProjectionData(1000, 500, 0, 1).at(-1);
  close(zero.balance, 7000); close(zero.totalContributions, 6000); close(zero.totalInterest, 0);
  const last = calculateProjectionData(1000, 500, 7, 1).at(-1);
  const rate = .07 / 12;
  close(last.balance, 1000 * (1 + rate) ** 12 + 500 * (((1 + rate) ** 12 - 1) / rate));
  close(last.balance, last.initialBalance + last.totalContributions + last.totalInterest);
});

test('legacy categories inherit across income rows and stay account-scoped', () => {
  const rows = normalizeAssetTransactions([tx('dividend', 10, { assetCode: 'vti' }), tx('buy', 800, asset), tx('buy', 100, { ...asset, accountId: 'other', assetCategory: 'REIT ETF' })]);
  assert.equal(rows[0].assetCategory, 'Stock ETF');
  assert.equal(rows[2].assetCategory, 'REIT ETF');
  const legacy = calculatePortfolio([tx('buy', 800, asset), tx('dividend', 10, { assetCode: 'VTI' })]);
  close(legacy.inferredFunding, 800); close(legacy.balance, 810);
  assert.equal(calculatePortfolio([tx('buy', 100)]).incompleteTrades, true);
  close(calculateAssetAllocation([tx('buy', 100, { assetCode: 'UNKNOWN', shares: 1 })]).investment.Uncategorized, 100);
});

test('451-row public workbook reconciles all dashboards and 70/20/10 allocation', () => {
  const folder = path.join(process.env.NODEJS_DEMO_DATA || path.resolve(__dirname, '../../demo-data'), '001');
  const expected = JSON.parse(fs.readFileSync(path.join(folder, 'portfolio-expected.json')));
  const book = XLSX.readFile(path.join(folder, 'Synthetic_Portfolio.xlsx'), { cellDates: true });
  const rows = ['S_Transactions', 'I_M_Transactions', 'I_SD_Transactions'].flatMap(name => XLSX.utils.sheet_to_json(book.Sheets[name]).map(row => ({ ...row, date: row.date.toISOString() })));
  assert.equal(rows.length, expected.transactions);
  for (const [id, count] of Object.entries(expected.counts)) assert.equal(rows.filter(row => row.accountId === id).length, count);
  close(calculateBalance(rows.filter(row => row.accountId === 'demo_savings')), expected.savingsBalance);
  close(calculateBalance(rows.filter(row => row.accountId === 'demo_managed')), expected.managedBalance);
  const self = rows.filter(row => row.accountId === 'demo_self');
  const p = calculatePortfolio(self);
  close(p.cash, expected.selfDirected.cash); close(p.investedCost, expected.selfDirected.holdingsCost);
  close(p.balance, expected.selfDirected.balance); close(p.realizedGain, expected.selfDirected.realizedGain);
  assert.equal(p.incompleteTrades, false); close(p.inferredFunding, 0);
  const allocation = calculateAssetAllocation(self).investment;
  close(allocation['Stock ETF'] / p.investedCost, .7, .00001);
  close(allocation['Individual Stock'] / p.investedCost, .2, .00001);
  close(allocation.REIT / p.investedCost, .1, .00001);
  close(generateGrowthData(self).at(-1).balance, p.balance);
  close(Object.values(generateAssetPerformanceData(self).monthlyData.at(-1).assets).reduce((sum, asset) => sum + asset.realizedGains, 0), expected.selfDirected.realizedGain);
});


test('quarterly income accumulates for reinvestment and sales stay cash until withdrawal', () => {
  const rows = [];
  const record = (type, amount, extra, cash) => {
    rows.push(tx(type, amount, { date: `2026-01-${String(rows.length + 1).padStart(2, '0')}`, ...extra }));
    close(calculatePortfolio(rows).cash, cash);
  };
  record('contribution', 1000, {}, 1000);
  record('buy', 900, { ...asset, shares: 9 }, 100);
  record('dividend', 30, { assetCode: 'VTI' }, 130);
  record('dividend', 20, { assetCode: 'VTI' }, 150);
  record('interest', 5, {}, 155);
  record('contribution', 200, {}, 355);
  record('buy', 300, { ...asset, shares: 3 }, 55);
  record('sell', 250, { ...asset, shares: 2 }, 305);
  record('withdrawal', 100, {}, 205);
  close(calculatePortfolio(rows).investedCost, 1000);
  close(calculatePortfolio(rows).balance, 1205);
  assert.deepEqual(calculateTransactionSummary(rows, new Date('2026-01-31')).allTime,
    { contributions: 1200, withdrawals: 100, interest: 55 });
});
