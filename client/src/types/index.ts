// =================== USER ===================
export interface User {
  id: string;
  name: string;
  email?: string; // Owner only
  username?: string; // Staff only
  role: "owner" | "staff" | "member";
  gymId?: string; // Member only
}

// =================== AUTH ===================
export interface LoginOwnerPayload {
  email: string;
  password: string;
}

export interface LoginStaffPayload {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

// =================== WALK-IN ===================
export interface WalkIn {
  _id: string;
  walkId: string;
  name: string;
  phone?: string;
  passType: "regular" | "student";
  amount: number;
  date: string;
  checkIn: string;
  checkOut?: string;
  duration?: string;
  isCheckedOut: boolean;
  staffId: {
    _id: string;
    name: string;
    username: string;
  };
}

export interface WalkInSummary {
  total: number;
  revenue: number;
  regular: number;
  student: number;
  checkedOut: number;
  stillInside: number;
}

export interface WalkInTodayResponse {
  success: boolean;
  date: string;
  summary: WalkInSummary;
  walkIns: WalkIn[];
}

// =================== API RESPONSE ===================
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}
