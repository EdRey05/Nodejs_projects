'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AppContextType {
  updateContext: (newContext: string) => void;
  getAppContext: () => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<string>("No context available yet.");

  const updateContext = useCallback((newContext: string) => {
    setContext(newContext);
  }, []);

  const getAppContext = useCallback(() => {
    return context;
  }, [context]);

  return (
    <AppContext.Provider value={{ updateContext, getAppContext }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
}
