import { create } from 'zustand';
import { api } from '../api/endpoints';
import { loadTokens, saveTokens, setUnauthorizedHandler } from '../api/client';
import { registerForPush } from '../api/push';
import { UserProfile } from '../api/types';

interface AuthState {
  user: UserProfile | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (input: { name: string; email?: string; phone?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  error: null,

  bootstrap: async () => {
    setUnauthorizedHandler(() => set({ status: 'unauthenticated', user: null }));
    const tokens = await loadTokens();
    if (!tokens) {
      set({ status: 'unauthenticated' });
      return;
    }
    try {
      const user = await api.me();
      set({ user, status: 'authenticated' });
      registerForPush();
    } catch {
      await saveTokens(null);
      set({ status: 'unauthenticated' });
    }
  },

  login: async (login, password) => {
    set({ error: null });
    try {
      await api.login(login, password);
      const user = await api.me();
      set({ user, status: 'authenticated' });
      registerForPush();
    } catch (e: any) {
      set({ error: e.message ?? 'Не удалось войти' });
      throw e;
    }
  },

  register: async (input) => {
    set({ error: null });
    try {
      await api.register(input);
      const user = await api.me();
      set({ user, status: 'authenticated' });
      registerForPush();
    } catch (e: any) {
      set({ error: e.message ?? 'Не удалось зарегистрироваться' });
      throw e;
    }
  },

  logout: async () => {
    const tokens = await loadTokens();
    if (tokens) await api.logout(tokens.refreshToken);
    set({ user: null, status: 'unauthenticated' });
  },
}));
