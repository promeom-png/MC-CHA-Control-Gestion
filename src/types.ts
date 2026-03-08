export type Business = 'MC' | 'CHA';

export type ExpenseCategory = 'Food Cost' | 'Operating' | 'Personnel';

export type PaymentMethod = 'Cash' | 'Domiciled';

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  business: Business;
  description?: string;
}

export interface Sale {
  id: string;
  date: string;
  endDate?: string; // Optional for date ranges
  amount: number;
  business: Business;
  ticketsSold?: number; // Only for CHA
}

export interface Settings {
  internalChargePrice: number; // Price per ticket for room/tasting
}

export interface FinancialData {
  expenses: Expense[];
  sales: Sale[];
  settings: Settings;
}
