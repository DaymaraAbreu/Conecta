import React, { createContext, ReactNode, useContext, useState } from 'react';

export type ProfileSyncState = 'idle' | 'syncing' | 'ready' | 'error';

export type AccountSession = {
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  profileSyncState: ProfileSyncState;
  profileSyncError: string;
  retryProfileSync: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const anonymousSession: AccountSession = {
  isSignedIn: false,
  userId: null,
  email: null,
  displayName: null,
  profileSyncState: 'idle',
  profileSyncError: '',
  retryProfileSync: async () => false,
  signOut: async () => undefined,
};

const DemoContext = createContext<{
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} | null>(null);

const AccountContext = createContext<AccountSession>(anonymousSession);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  return (
    <DemoContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </DemoContext.Provider>
  );
}

export function AccountSessionProvider({
  value,
  children,
}: {
  value: AccountSession;
  children: ReactNode;
}) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemoMode must be used inside AppSessionProvider');
  return context;
}

export function useAccountSession() {
  return useContext(AccountContext);
}
