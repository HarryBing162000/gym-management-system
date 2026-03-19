import api from "./api";

export type PaymentMethod = "cash" | "online";
export type PaymentType = "new_member" | "renewal" | "manual";

export interface Payment {
  _id: string;
  gymId: string;
  memberName: string;
  amount: number;
  amountPaid: number;
  totalAmount: number;
  balance: number;
  isPartial: boolean;
  method: PaymentMethod;
  type: PaymentType;
  plan: string;
  notes?: string;
  processedBy: { _id: string; name: string; username?: string; role: string };
  createdAt: string;
}

export interface PaymentSummaryItem {
  total: number;
  revenue: number;
  cash: number;
  online: number;
  cashRev: number;
  onlineRev: number;
  partial: number;
  outstanding: number;
}

export interface PaymentSummary {
  today: PaymentSummaryItem;
  week: PaymentSummaryItem;
  month: PaymentSummaryItem;
  withBalance: number;
}

export interface PaymentsResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  payments: Payment[];
}

export const paymentService = {
  getSummary: async (): Promise<PaymentSummary> => {
    const res = await api.get("/payments/summary");
    return res.data;
  },

  getAll: async (params?: {
    method?: string;
    type?: string;
    partial?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<PaymentsResponse> => {
    const res = await api.get("/payments", { params });
    return res.data;
  },

  create: async (payload: {
    gymId: string;
    method: PaymentMethod;
    type?: PaymentType;
    amountPaid?: number;
    notes?: string;
  }): Promise<{ success: boolean; message: string; payment: Payment }> => {
    const res = await api.post("/payments", payload);
    return res.data;
  },

  settle: async (
    gymId: string,
    method: PaymentMethod,
  ): Promise<{ success: boolean; message: string; payment: Payment }> => {
    const res = await api.post(`/payments/${gymId}/settle`, { method });
    return res.data;
  },
};
