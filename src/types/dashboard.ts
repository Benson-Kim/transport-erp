import { ServiceStatus } from "@/app/generated/prisma";

export interface DashboardDateRange {
    from?: string;
    to?: string;
    preset?: string;
}

export interface DashboardData {
    stats: {
        activeServices: number;
        activeServicesChange: number;
        completedServices: number;
        completedServicesChange: number;
        totalRevenue: number;
        totalRevenueChange: number;
        averageMargin: number;
        averageMarginAmount: number;
        averageMarginChange: number;
        totalServices: number;
    };
    servicesChart: Array<{
        month: string;
        completed: number;
        inProgress: number;
        cancelled: number;
        total: number;
    }>;
    revenueChart: Array<{
        month: string;
        revenue: number;
        cost: number;
        margin: number;
    }>;
    recentServices: Array<{
        id: string;
        serviceNumber: string;
        date: string;
        clientName: string;
        origin: string;
        destination: string;
        status: ServiceStatus;
        amount: number;
        currency: string;
    }>;
}