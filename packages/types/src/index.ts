// ─── User Roles ───────────────────────────────────────────────────────────────
export type UserRole = 'CONTRACTOR' | 'SUPPLIER' | 'DRIVER' | 'ADMIN';

// ─── User Status ──────────────────────────────────────────────────────────────
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

// ─── Supplier Verification ────────────────────────────────────────────────────
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// ─── OTP Purpose ──────────────────────────────────────────────────────────────
export type OtpPurpose = 'PHONE_VERIFY' | 'PASSWORD_RESET';

// ─── Order Status ─────────────────────────────────────────────────────────────
export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'MODIFIED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PREPARING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'VERIFIED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

// ─── Delivery Status ──────────────────────────────────────────────────────────
export type DeliveryStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'STARTED'
  | 'ARRIVED'
  | 'COMPLETED';

// ─── Escrow Transaction Type ──────────────────────────────────────────────────
export type EscrowTransactionType = 'FUND' | 'HOLD' | 'RELEASE' | 'REFUND';

// ─── Shared API Response ──────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email?: string;
  phone: string;
  role: UserRole;
  isVerified: boolean;
}

// ─── User Types ───────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email?: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
  createdAt: string;
  contractorProfile?: {
    firstName: string;
    lastName: string;
    company?: string;
  };
  supplierProfile?: {
    businessName: string;
    verificationStatus: VerificationStatus;
    rejectionReason?: string;
  };
  driverProfile?: {
    firstName: string;
    lastName: string;
    licenseNo?: string;
  };
}
