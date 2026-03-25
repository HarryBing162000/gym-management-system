import api from "./api";

export interface ActionLog {
  _id: string;
  action: string;
  performedBy: {
    userId: string;
    name: string;
    role: "owner" | "staff";
  };
  targetId?: string;
  targetName?: string;
  detail: string;
  timestamp: string;
}

interface GetLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  role?: string;
  staffId?: string;
  from?: string;
  to?: string;
}

interface GetLogsResponse {
  logs: ActionLog[];
  total: number;
  page: number;
  limit: number;
}

export const actionLogService = {
  getLogs: async (params: GetLogsParams = {}): Promise<GetLogsResponse> => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.action) query.set("action", params.action);
    if (params.role) query.set("role", params.role);
    if (params.staffId) query.set("staffId", params.staffId);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);

    const res = await api.get(`/action-logs?${query.toString()}`);
    return res.data;
  },
};
