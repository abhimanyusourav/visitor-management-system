import { create } from 'zustand';
import { User, Site, RoleSlug } from '../types/index.js';

interface AuthState {
  user: User | null;
  token: string | null;
  activeSite: Site | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  setActiveSite: (site: Site) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hasPermission: (permissionCode: string) => boolean;
  hasRole: (roles: RoleSlug[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initialToken = localStorage.getItem('vms_auth_token');

  return {
    user: null,
    token: initialToken,
    activeSite: null,
    isLoading: Boolean(initialToken),

    setAuth: (user, token) => {
      localStorage.setItem('vms_auth_token', token);
      const initialSite = user.activeSite || user.authorizedSites?.[0] || null;
      if (initialSite) {
        localStorage.setItem('vms_active_site_id', initialSite.id);
      }
      set({ user, token, activeSite: initialSite, isLoading: false });
    },

    setActiveSite: (site) => {
      localStorage.setItem('vms_active_site_id', site.id);
      set((state) => ({
        activeSite: site,
        user: state.user ? { ...state.user, activeSite: site } : null
      }));
    },

    setUser: (user) => {
      const currentSiteId = localStorage.getItem('vms_active_site_id');
      const matchedSite = user.authorizedSites?.find(s => s.id === currentSiteId) || user.activeSite || user.authorizedSites?.[0] || null;
      if (matchedSite) {
        localStorage.setItem('vms_active_site_id', matchedSite.id);
      }
      set({ user, activeSite: matchedSite, isLoading: false });
    },

    logout: () => {
      localStorage.removeItem('vms_auth_token');
      localStorage.removeItem('vms_active_site_id');
      set({ user: null, token: null, activeSite: null, isLoading: false });
    },

    hasPermission: (permissionCode: string) => {
      const { user } = get();
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return user.permissions?.includes(permissionCode) ?? false;
    },

    hasRole: (roles: RoleSlug[]) => {
      const { user } = get();
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return roles.includes(user.role);
    }
  };
});
