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
  isDefault: boolean;
  members?: { user: { id: string; name: string } }[];
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
  status: 'CONFIRMED' | 'PENDING' | 'NEEDS_CLARIFICATION' | 'RECOGNITION_ERROR';
  category?: { id: string; name: string; color?: string | null; icon?: string | null } | null;
  paidBy?: { id: string; name: string } | null;
}

export interface AnalyticsSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
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
  schedule?: {
    nextPaymentDate: string;
    nextPaymentAmount: number;
    remainingAmount: number;
    monthsLeft: number;
    totalFuturePayments: number;
  };
}

export interface Investment {
  id: string;
  assetName: string;
  assetType: string;
  quantity: string;
  averageBuyPrice: string;
  currentPrice?: string | null;
  currency: string;
  marketValue?: number;
  profit?: number;
}

export interface InvestmentForecast {
  portfolioValue: number;
  expectedDividendsThisMonth: number;
  expectedDividendsThisYear: number;
  receivedDividendsThisYear: number;
}

export interface RecognitionDraft {
  logId: string;
  portfolioId: string;
  parsed: {
    amount: number | null;
    currency: string;
    date: string | null;
    merchant: string | null;
    description: string | null;
    category: string | null;
    confidence: number;
    needsClarification: boolean;
    clarificationQuestion: string | null;
  };
  resolvedCategoryId: string | null;
  resolvedCategoryName: string | null;
  status: 'CONFIRMED' | 'PENDING' | 'NEEDS_CLARIFICATION' | 'RECOGNITION_ERROR';
  duplicateOf: string | null;
}
