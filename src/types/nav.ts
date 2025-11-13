export interface MainLayoutProps {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
  };
  companyName: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
  badge?: number;
  permissions?: string[];
}

export interface TopBarProps {
  user: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
  };
  companyName: string;
  showHamburger: boolean;
}

export interface LayoutContextValue {
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toggleSidebarCollapse: () => void;
  closeSidebar: () => void;
}
