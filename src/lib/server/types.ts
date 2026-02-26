export interface StoreSettings {
    [key: string]: string;
}

export interface UserSummary {
    id: string;
    username: string;
    name: string;
    role: 'admin' | 'manager' | 'sales';
    isActive: boolean;
    phone: string | null;
    email: string | null;
    imageUrl: string | null;
}

export interface AuditLogEntry {
    id: string;
    userId: string | null;
    userName: string;
    action: string;
    entity: string;
    entityId: string | null;
    details: string | null;
    hash: string;
    createdAt: Date;
}

export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalLogs: number;
}
