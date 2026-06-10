import React, {createContext, useContext, useMemo} from 'react';
import type {DiscordClient} from './discord.js';

const Ctx = createContext<DiscordClient | null>(null);

export function ClientProvider({
  client,
  children,
}: {
  client: DiscordClient;
  children: React.ReactNode;
}) {
  const memo = useMemo(() => client, [client]);
  return React.createElement(Ctx.Provider, {value: memo}, children);
}

export function useClient(): DiscordClient {
  const c = useContext(Ctx);
  if (!c) throw new Error('useClient must be used within ClientProvider');
  return c;
}
