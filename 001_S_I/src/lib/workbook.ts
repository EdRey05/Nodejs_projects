import * as XLSX from 'xlsx';
import type { Account, Transaction } from './types';
import { normalizeAssetTransactions } from './portfolio';

export type WorkbookData = { accounts: Account[]; transactions: Transaction[] };
export type WorkbookBinding = { path: string; revision: string; token: string };

export function validateWorkbookData(input: unknown): WorkbookData {
  const data = input as WorkbookData;
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) throw new Error('Invalid workbook data.');
  const ids = new Set(data.accounts.map(account => account?.id));
  if (ids.size !== data.accounts.length || data.accounts.some(account => !account || typeof account.id !== 'string' || !account.id || !account.name || !account.bank ||
    !['savings', 'investment'].includes(account.type) || (account.type === 'investment' && !['managed', 'self-directed'].includes(account.subtype || '')))) {
    throw new Error('Accounts must have unique IDs, names, banks and valid types/subtypes.');
  }
  const transactions = normalizeAssetTransactions(data.transactions.map(txn => ({ ...txn, date: (txn.date as unknown) instanceof Date ? (txn.date as unknown as Date).toISOString() : txn.date })));
  if (new Set(transactions.map(txn => txn.id)).size !== transactions.length || transactions.some(txn => !ids.has(txn.accountId) || typeof txn.id !== 'string' || !txn.id ||
    !Number.isFinite(txn.amount) || txn.amount < 0 || typeof txn.date !== 'string' || !Number.isFinite(Date.parse(txn.date)) ||
    !['contribution', 'withdrawal', 'interest', 'buy', 'sell', 'dividend', 'stock-lending', 'distribution'].includes(txn.type) ||
    (['buy', 'sell'].includes(txn.type) && (!txn.assetCode || !Number.isFinite(txn.shares) || (txn.shares || 0) <= 0)))) {
    throw new Error('Transactions need unique IDs, valid accounts, amounts, dates and types. Trades need a ticker and positive shares.');
  }
  return { accounts: data.accounts, transactions };
}

export function readWorkbook(bytes: ArrayBuffer | Uint8Array): WorkbookData {
  const book = XLSX.read(bytes, { type: 'array', cellDates: true });
  if (!book.Sheets.Accounts) throw new Error("Invalid file format. 'Accounts' sheet is required.");
  const rows = (name: string) => book.Sheets[name] ? XLSX.utils.sheet_to_json(book.Sheets[name]) : [];
  return validateWorkbookData({ accounts: rows('Accounts'), transactions: ['S_Transactions', 'I_M_Transactions', 'I_SD_Transactions'].flatMap(rows) });
}

export function createWorkbook(data: WorkbookData, existing?: Uint8Array) {
  data = validateWorkbookData(data);
  const book = existing ? XLSX.read(existing, { type: 'array', cellDates: true }) : XLSX.utils.book_new();
  const accounts = new Map(data.accounts.map(account => [account.id, account]));
  const sheets = {
    Accounts: XLSX.utils.json_to_sheet(data.accounts, { header: ['id', 'name', 'bank', 'type', 'interestRate', 'subtype'] }),
    S_Transactions: XLSX.utils.json_to_sheet(data.transactions.filter(txn => accounts.get(txn.accountId)?.type === 'savings')),
    I_M_Transactions: XLSX.utils.json_to_sheet(data.transactions.filter(txn => accounts.get(txn.accountId)?.subtype === 'managed')),
    I_SD_Transactions: XLSX.utils.json_to_sheet(data.transactions.filter(txn => accounts.get(txn.accountId)?.subtype === 'self-directed')),
  };
  for (const [name, sheet] of Object.entries(sheets)) {
    book.Sheets[name] = sheet;
    if (!book.SheetNames.includes(name)) book.SheetNames.push(name);
  }
  return book;
}
