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
}

function visiblePortfolios(items: Portfolio[]) {
  return items.filter((portfolio) => portfolio.type !== 'PERSONAL');
}

export const usePortfolios = create<PortfolioState>((set, get) => ({
  portfolios: [],
  selectedId: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const portfolios = visiblePortfolios(await api.portfolios());
      set((s) => {
        const selectedStillExists = portfolios.some((p) => p.id === s.selectedId);
        return {
          portfolios,
          selectedId: selectedStillExists ? s.selectedId : portfolios[0]?.id ?? null,
        };
      });
    } finally {
      set({ loading: false });
    }
  },

  select: (id) => set({ selectedId: id }),
  selected: () => get().portfolios.find((p) => p.id === get().selectedId) ?? null,
}));
