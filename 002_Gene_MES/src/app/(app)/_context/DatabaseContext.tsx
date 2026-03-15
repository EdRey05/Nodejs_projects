'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { LogType } from '@/lib/types';

interface Database {
  buffer: ArrayBuffer | null;
  name: string | null;
  images?: Record<string, string[]>; // Key: "{entryCode}_{plateId}", Value: array of data URIs
}

interface DatabaseContextType {
  databases: Record<string, Database>;
  setDatabase: (logType: LogType, database: Database) => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseContextProvider({ children }: { children: ReactNode }) {
  const [databases, setDatabases] = useState<Record<string, Database>>({});

  const setDatabase = useCallback((logType: LogType, database: Database) => {
    setDatabases(prev => ({ ...prev, [logType]: database }));
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
