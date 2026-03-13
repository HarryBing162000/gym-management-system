export interface Member {
  _id?: string;
  memberId: string; // The unique ID for Kiosk
  name: string;
  phone: string;
  address: string;
  membershipStatus: "active" | "expired";
  expiryDate: Date;
  balance: number;
}
