export type UserRole = 'CONTRACTOR' | 'SUPPLIER' | 'DRIVER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OtpPurpose = 'PHONE_VERIFY' | 'PASSWORD_RESET';
export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'MODIFIED' | 'APPROVED' | 'REJECTED' | 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'VERIFIED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
export type DeliveryStatus = 'ASSIGNED' | 'ACCEPTED' | 'STARTED' | 'ARRIVED' | 'COMPLETED';
export type EscrowTransactionType = 'FUND' | 'HOLD' | 'RELEASE' | 'REFUND';
export interface ApiResponse<T = unknown> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}
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
