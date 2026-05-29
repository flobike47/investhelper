import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { configureApi } from '@/services/api';
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
      await supabase.auth.signOut();
    },
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

function applyToken(accessToken: string | undefined) {
  configureApi(runtimeConfig.bffUrl, accessToken ?? '');
}
