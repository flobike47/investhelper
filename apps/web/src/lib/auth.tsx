import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { configureApi } from '@/services/api';
import { disableDevicePush } from '@/services/push';
import { runtimeConfig } from './runtimeConfig';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Context = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      applyToken(data.session?.access_token);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      applyToken(s?.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle: async () => {
      // redirectTo doit inclure le sous-chemin où l'app est servie sinon
      // Supabase te ramène à la racine du domaine et le hash #access_token
      // est perdu pour l'app.
      const redirectTo =
        window.location.origin +
        (runtimeConfig.basePath === '/' ? '/' : runtimeConfig.basePath);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    },
    signOut: async () => {
      // Cet appareil ne doit plus recevoir les rappels de ce compte. Au mieux
      // 3 s, avant la déconnexion (le BFF exige encore la session).
      await Promise.race([
        disableDevicePush().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      await supabase.auth.signOut();
    },
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// Le hook vit avec son Provider (même contexte) — compromis assumé sur le fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

function applyToken(accessToken: string | undefined) {
  configureApi(runtimeConfig.bffUrl, accessToken ?? '');
}
