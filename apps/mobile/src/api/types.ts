export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  telegramId?: string | null;
  defaultCurrency: string;
}

export type PortfolioType = 'PERSONAL' | 'FAMILY' | 'SHARED' | 'INVESTMENT' | 'GOAL' | 'OTHER';

export interface Portfolio {
  id: string;
  name: string;
  type: PortfolioType;
  currency: string;
  description?: string | null;
  currentBalance?: string | number | null;
  isDefault: boolean;
  members?: { user: { id: string; name: string }; role?: string; accessLevel?: string; id?: string }[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  isSystem: boolean;
}

export type AccessLevel = 'FULL' | 'LIMITED' | 'VIEW_ONLY' | 'PRIVATE';

export interface PortfolioMember {
  id: string;
  role: 'OWNER' | 'MEMBER' | 'VIEWER';
  accessLevel: AccessLevel;
  status: string;
  user: { id: string; name: string; email?: string | null; avatarUrl?: string | null };
}

export interface Expense {
  id: string;
  amount: string;
  currency: string;
  date: string;
  title?: string | null;
  merchant?: string | null;
  comment?: string | null;
  categoryId?: string | null;
  portfolioId?: string | null;
  scope?: 'PERSONAL' | 'SHARED';
  status: 'CONFIRMED' | 'PENDING' | 'NEEDS_CLARIFICATION' | 'RECOGNITION_ERROR';
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null;
  paidBy?: { id: string; name: string } | null;
}

export interface AnalyticsSummary {
  totalIncome: number;
  totalExpense: number;
  actualExpense: number;
  plannedExpense: number;
  balance: number;
  currentBalance?: number;
  availableNow?: number;
  obligatoryTotal: number;
  remainingObligatory: number;
  freeMoney: number;
  personalExpense: number;
  sharedExpense: number;
  byCategory: { id: string; name: string; color?: string; icon?: string; amount: number }[];
  byMember: { userId: string; name: string; amount: number }[];
}

export interface Credit {
  id: string;
  title: string;
  bankName?: string | null;
  remainingAmount: string;
  monthlyPayment: string;
  paymentDay: number;
  status: 'ACTIVE' | 'CLOSED' | 'OVERDUE';
}

export interface Investment {
  id: string;
  assetName: string;
  assetType: string;
  quantity: string;
  averageBuyPrice: string;
  currentPrice?: string | null;
  expectedDividends?: string | null;
}

export interface InvestmentForecast {
  totalInvested: number;
  currentValue: number;
  expectedDividends: number;
  assets: { id: string; name: string; profit: number; value: number }[];
}

export interface RecognitionDraft {
  logId?: string;
  amount?: number | null;
  merchant?: string | null;
  date?: string | null;
  categoryId?: string | null;
  confidence?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
}
