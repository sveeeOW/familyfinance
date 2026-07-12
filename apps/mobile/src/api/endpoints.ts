import { request, saveTokens } from './client';
import {
  AnalyticsSummary,
  AuthTokens,
  Category,
  Credit,
  Expense,
  Investment,
  InvestmentForecast,
  Portfolio,
  PortfolioMember,
  RecognitionDraft,
  UserProfile,
} from './types';

export const api = {
  // Auth
  async login(login: string, password: string) {
    const tokens = await request<AuthTokens>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { login, password },
    });
    await saveTokens(tokens);
    return tokens;
  },
  async register(input: { name: string; email?: string; phone?: string; password: string }) {
    const tokens = await request<AuthTokens>('/auth/register', {
      method: 'POST',
      auth: false,
      body: input,
    });
    await saveTokens(tokens);
    return tokens;
  },
  async logout(refreshToken: string) {
    try {
      await request('/auth/logout', { method: 'POST', body: { refreshToken } });
    } finally {
      await saveTokens(null);
    }
  },

  // Users
  me: () => request<UserProfile>('/users/me'),

  // Portfolios
  portfolios: () => request<Portfolio[]>('/portfolios'),
  createPortfolio: (body: { name: string; type: string; currency?: string; description?: string; currentBalance?: number }) =>
    request<Portfolio>('/portfolios', { method: 'POST', body }),
  updatePortfolio: (portfolioId: string, body: Partial<{ name: string; type: string; currency: string; description: string; currentBalance: number }>) =>
    request<Portfolio>(`/portfolios/${portfolioId}`, { method: 'PATCH', body }),
  createInvite: (portfolioId: string) =>
    request<{ url: string; token: string }>(`/portfolios/${portfolioId}/invite`, {
      method: 'POST',
      body: {},
    }),

  // Categories
  categories: (portfolioId: string) =>
    request<Category[]>(`/categories?portfolioId=${portfolioId}`),
  createCategory: (portfolioId: string, body: { name: string; color?: string; icon?: string }) =>
    request<Category>(`/categories?portfolioId=${portfolioId}`, { method: 'POST', body }),
  updateCategory: (id: string, body: { name?: string; color?: string; isActive?: boolean }) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => request<unknown>(`/categories/${id}`, { method: 'DELETE' }),

  // Members
  members: (portfolioId: string) =>
    request<PortfolioMember[]>(`/portfolios/${portfolioId}/members`),
  updateMember: (portfolioId: string, memberId: string, body: { role?: string; accessLevel?: string }) =>
    request<PortfolioMember>(`/portfolios/${portfolioId}/members/${memberId}`, { method: 'PATCH', body }),
  removeMember: (portfolioId: string, memberId: string) =>
    request<unknown>(`/portfolios/${portfolioId}/members/${memberId}`, { method: 'DELETE' }),

  // Expenses
  expenses: (portfolioId: string) =>
    request<Expense[]>(`/expenses?portfolioId=${portfolioId}`),
  needsClarification: (portfolioId: string) =>
    request<Expense[]>(`/expenses/needs-clarification?portfolioId=${portfolioId}`),
  createExpense: (body: Record<string, unknown>) =>
    request<Expense>('/expenses', { method: 'POST', body }),
  clarifyExpense: (id: string, body: { categoryId?: string; comment?: string }) =>
    request<Expense>(`/expenses/${id}/clarify`, { method: 'POST', body }),
  confirmExpense: (id: string) =>
    request<Expense>(`/expenses/${id}/confirm`, { method: 'POST', body: {} }),

  // Credits
  credits: (portfolioId: string) => request<Credit[]>(`/credits?portfolioId=${portfolioId}`),
  createCredit: (body: Record<string, unknown>) =>
    request<Credit>('/credits', { method: 'POST', body }),

  // Investments
  investments: (portfolioId: string) =>
    request<Investment[]>(`/investments?portfolioId=${portfolioId}`),
  investmentForecast: (portfolioId: string) =>
    request<InvestmentForecast>(`/investments/forecast?portfolioId=${portfolioId}`),
  createInvestment: (body: Record<string, unknown>) =>
    request<Investment>('/investments', { method: 'POST', body }),

  // AI / распознавание чека из приложения
  recognizeImage: (portfolioId: string, imageBase64: string, mimeType = 'image/jpeg') =>
    request<RecognitionDraft>('/ai/recognize-expense', {
      method: 'POST',
      body: { portfolioId, imageBase64, mimeType },
    }),
  recognizeTextAi: (portfolioId: string, text: string) =>
    request<RecognitionDraft>('/ai/recognize-expense', {
      method: 'POST',
      body: { portfolioId, text },
    }),
  confirmRecognition: (body: { logId: string; categoryId?: string; force?: boolean }) =>
    request<{ expenseId?: string }>('/ai/confirm-expense', { method: 'POST', body }),

  // Incomes
  incomes: (portfolioId: string) => request<any[]>(`/incomes?portfolioId=${portfolioId}`),
  createIncome: (body: Record<string, unknown>) =>
    request<any>('/incomes', { method: 'POST', body }),

  // Analytics
  summary: (portfolioId: string) =>
    request<AnalyticsSummary>(`/analytics/summary?portfolioId=${portfolioId}`),
  forecast: (portfolioId: string) =>
    request<any>(`/analytics/forecast?portfolioId=${portfolioId}`),
  monthly: (portfolioId: string) =>
    request<any[]>(`/analytics/monthly?portfolioId=${portfolioId}`),

  // Telegram
  telegramLinkCode: () =>
    request<{ code: string; deepLink: string }>('/telegram/link-code', { method: 'POST', body: {} }),

  // Push-уведомления
  registerDevice: (token: string, platform: string) =>
    request<{ success: boolean }>('/notifications/device-token', {
      method: 'POST',
      body: { token, platform },
    }),
};
