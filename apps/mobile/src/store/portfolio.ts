import { create } from 'zustand';
import { api } from '../api/endpoints';
import { Portfolio } from '../api/types';

interface PortfolioState {
  portfolios: Portfolio[];
  selectedId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  select: (id: string) => void;
  selected: () => Portfolio | null;
  personal: () => Portfolio | null;
  shared: () => Portfolio[];
}

function defaultPortfolio(items: Portfolio[]) {
  return items.find((portfolio) => portfolio.isDefault) ?? items.find((portfolio) => portfolio.type === 'PERSONAL') ?? items[0] ?? null;
}

function sharedPortfolios(items: Portfolio[]) {
  return items.filter((portfolio) => portfolio.type !== 'PERSONAL' || (portfolio.members?.length ?? 0) > 1);
}

export const usePortfolios = create<PortfolioState>((set, get) => ({
  portfolios: [],
  selectedId: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const portfolios = await api.portfolios();
      set((s) => {
        const selectedStillExists = portfolios.some((p) => p.id === s.selectedId);
        const fallback = defaultPortfolio(portfolios);
        return {
          portfolios,
          selectedId: selectedStillExists ? s.selectedId : fallback?.id ?? null,
        };
      });
    } finally {
      set({ loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  selected: () => get().portfolios.find((p) => p.id === get().selectedId) ?? defaultPortfolio(get().portfolios),
  personal: () => defaultPortfolio(get().portfolios),
  shared: () => sharedPortfolios(get().portfolios),
}));
