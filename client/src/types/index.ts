// =================== USER ===================
export interface User {
  id: string;
  name: string;
  email?: string;
  username?: string;
  role: "owner" | "staff" | "member";
  gymId?: string;
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

// =================== MEMBER ===================
export type MemberStatus = "active" | "inactive" | "expired";
export type MemberPlan = string; // dynamic — plan names come from Settings.plans

export interface Member {
  gymId: string;
  name: string;
  email?: string;
  phone?: string;
  plan: string;
  status: MemberStatus;
  expiresAt: string;
  checkedIn: boolean;
  lastCheckIn?: string;
  photoUrl?: string;
  isActive: boolean;
  balance: number;
  createdAt: string;
}

export interface MembersResponse {
  success: boolean;
  total: number;
  page: number;
  totalPages: number;
  members: Member[];
}

export interface CreateMemberPayload {
  name: string;
  email?: string;
  phone?: string;
  plan: MemberPlan;
  status: "active" | "inactive";
  expiresAt: string;
  paymentMethod?: "cash" | "online";
  amountPaid?: number;
  totalAmount?: number;
}

export interface UpdateMemberPayload {
  name?: string;
  email?: string;
  phone?: string;
  plan?: MemberPlan;
  status?: MemberStatus;
  expiresAt?: string;
  photoUrl?: string;
}

// =================== WALK-IN ===================
export interface WalkIn {
  _id: string;
  walkId: string;
  name: string;
  phone?: string;
  passType: "regular" | "student" | "couple";
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
  couple: number;
  checkedOut: number;
  stillInside: number;
}

export interface WalkInTodayResponse {
  success: boolean;
  date: string;
  summary: WalkInSummary;
  walkIns: WalkIn[];
}

export interface WalkInRegisterPayload {
  name: string;
  phone?: string;
  passType: "regular" | "student" | "couple";
}

export interface WalkInRegisterResponse {
  success: boolean;
  message: string;
  walkIn: {
    walkId: string;
    name: string;
    phone?: string;
    passType: "regular" | "student" | "couple";
    amount: number;
    checkIn: string;
    date: string;
  };
}

// =================== API RESPONSE ===================
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}
