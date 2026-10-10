'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { LogType } from '@/lib/types';

export interface Database {
  buffer: ArrayBuffer | null;
  name: string | null;
  images?: Record<string, string[]>; // Key: "{entryCode}_{plateId}", Value: array of data URIs
  payload?: Record<string, any[]>; // DuckDB table data keyed by table name
}

interface DatabaseContextType {
  databases: Record<string, Database>;
  setDatabase: (key: LogType | string, database: Database) => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseContextProvider({ children }: { children: ReactNode }) {
  const [databases, setDatabases] = useState<Record<string, Database>>({});

  const setDatabase = useCallback((key: LogType | string, database: Database) => {
    setDatabases(prev => ({ ...prev, [key]: database }));
  }, []);

  return (
    <DatabaseContext.Provider value={{ databases, setDatabase }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseContextProvider');
  }
  return context;
}
