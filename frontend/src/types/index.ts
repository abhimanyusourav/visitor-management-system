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

export interface Site {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  timezone: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  settings?: any;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: RoleSlug;
  roleName: string;
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  permissions: string[];
  authorizedSites: Site[];
  activeSite?: Site | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  site_id?: string;
}

export interface Employee {
  id: string;
  organization_id: string;
  user_id?: string;
  department_id: string;
  department_name?: string;
  department_code?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  designation: string;
  photo_url?: string;
  is_active: boolean;
}

export interface Visitor {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  mobile_number: string;
  company_name?: string;
  designation?: string;
  default_visitor_type: VisitorType;
  id_type?: string;
  id_number_masked?: string;
  photo_url?: string;
  notes?: string;
  is_blacklisted: boolean;
  blacklist_reason?: string;
  total_visits_count?: number;
  last_visit_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  visit_code: string;
  visitor_id: string;
  visitor_name: string;
  mobile_number: string;
  visitor_email?: string;
  company_name?: string;
  visitor_designation?: string;
  visitor_photo?: string;
  id_type?: string;
  id_number_masked?: string;
  visitor_notes?: string;
  visitor_type: VisitorType;
  purpose: string;
  status: VisitStatus;
  expected_date: string;
  expected_time: string;
  expected_exit_time?: string;
  check_in_time?: string;
  check_out_time?: string;
  accompanying_count: number;
  remarks?: string;
  host_id: string;
  host_first_name: string;
  host_last_name: string;
  host_email?: string;
  host_phone?: string;
  host_designation?: string;
  department_id?: string;
  department_name: string;
  department_code?: string;
  site_id?: string;
  site_name: string;
  site_code: string;
  site_address?: string;
  pass_id?: string;
  pass_number?: string;
  qr_token?: string;
  pass_status?: string;
  printed_count?: number;
  vehicle_type?: string;
  vehicle_number?: string;
  driver_name?: string;
  created_at: string;
  approved_at?: string;
}

export interface DashboardStats {
  todayVisitors: number;
  currentlyInside: number;
  expectedToday: number;
  pendingApproval: number;
  checkedOutToday: number;
  contractorsInside: number;
}

export interface DashboardCharts {
  visitsByDay: { date: string; count: number }[];
  visitsByDepartment: { department: string; count: number }[];
  visitorTypeDistribution: { type: string; count: number }[];
  visitsByPurpose: { purpose: string; count: number }[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address?: string;
  user_agent?: string;
  first_name?: string;
  last_name?: string;
  user_email?: string;
  site_name?: string;
  old_values?: any;
  new_values?: any;
  metadata?: any;
  created_at: string;
}
