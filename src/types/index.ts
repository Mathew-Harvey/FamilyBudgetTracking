import type { Decimal } from "@prisma/client/runtime/library";

// Auth
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Bank Connection
export interface BankConnectionInfo {
  id: string;
  institutionName: string;
  institutionId: string;
  status: string;
  lastSyncAt: string | null;
  accountCount: number;
}

// Account
export interface AccountSummary {
  id: string;
  name: string;
  accountNumber: string | null;
  balance: number;
  availableFunds: number | null;
  type: string;
  currency: string;
  institutionName: string;
}

// Transaction
export interface TransactionItem {
  id: string;
  date: string;
  description: string;
  cleanDescription: string | null;
  amount: number;
  direction: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColour: string | null;
  categorySource: string | null;
  merchantName: string | null;
  accountName: string;
  isExcluded: boolean;
  isTransfer: boolean;
  linkedTransactionId: string | null;
  notes: string | null;
}

export interface TransactionFilters {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  accountId?: string;
  direction?: "debit" | "credit";
  search?: string;
  isExcluded?: boolean;
  page?: number;
  pageSize?: number;
}

// Category
export interface CategoryItem {
  id: string;
  name: string;
  icon: string | null;
  colour: string | null;
  parentId: string | null;
  isSystem: boolean;
  sortOrder: number;
  children?: CategoryItem[];
}

// Budget
export interface BudgetItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  categoryColour: string | null;
  amount: number;
  period: string;
  startDate: string;
}

export interface BudgetVsActual {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  categoryColour: string | null;
  budgetAmount: number;
  actualAmount: number;
  percentage: number;
  status: "on-track" | "warning" | "over-budget";
}

// Dashboard
export interface DashboardData {
  budgetStatus: BudgetVsActual[];
  accounts: AccountSummary[];
  recentTransactions: TransactionItem[];
  totalIncome: number;
  totalExpenses: number;
}

// AI Insights
export interface PeriodSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  totalMortgage: number;
  net: number;
}

// Basiq types
export interface BasiqTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface BasiqUser {
  id: string;
  email: string;
}

export interface BasiqJob {
  id: string;
  steps: BasiqJobStep[];
}

export interface BasiqJobStep {
  title: string;
  status: string;
  result?: {
    type: string;
    url: string;
  };
}

export interface BasiqAccount {
  id: string;
  accountNo: string;
  name: string;
  balance: string;
  availableFunds: string;
  class: {
    type: string;
  };
  currency: string;
  institution: string;
  connection: string;
}

export interface BasiqTransaction {
  id: string;
  amount: string;
  account: string;
  balance: string;
  class: string;
  connection: string;
  description: string;
  direction: string;
  institution: string;
  postDate: string;
  transactionDate: string;
  enrich?: {
    merchant?: {
      businessName: string;
    };
    category?: {
      anzsic?: {
        code: string;
        title: string;
      };
    };
    location?: {
      formattedAddress: string;
    };
  };
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Decimal helper - convert Prisma Decimal to number
export function decimalToNumber(val: Decimal | null | undefined): number {
  if (val == null) return 0;
  return Number(val);
}
