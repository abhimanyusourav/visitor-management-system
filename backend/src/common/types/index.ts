// Multi-Site Factory Visitor Management System - Domain Types

export type RoleSlug = 
  | 'SUPER_ADMIN' 
  | 'ADMIN' 
  | 'SITE_ADMIN' 
  | 'SECURITY' 
  | 'RECEPTION' 
  | 'EMPLOYEE';

export type VisitorType = 
  | 'Guest'
  | 'Customer'
  | 'Vendor'
  | 'Contractor'
  | 'Interview Candidate'
  | 'Delivery'
  | 'Service Engineer'
  | 'Government Official'
  | 'Other';

export type VisitStatus = 
  | 'REGISTERED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'EXPIRED';

export type VehicleType = 
  | 'TWO_WHEELER'
  | 'FOUR_WHEELER'
  | 'COMMERCIAL'
  | 'TRUCK'
  | 'OTHER';

export type PassType = 'STANDARD' | 'BADGE' | 'VIP' | 'CONTRACTOR';
export type PassStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface UserContext {
  userId: string;
  organizationId: string;
  role: RoleSlug;
  permissions: string[];
  allowedSiteIds: string[];
  activeSiteId?: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp?: string;
}
