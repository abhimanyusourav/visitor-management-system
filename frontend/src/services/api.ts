import axios from 'axios';

const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL !== undefined) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    // In production on standard ports 80/443 (Nginx reverse proxy), use same-origin relative URLs
    if (!window.location.port || window.location.port === '80' || window.location.port === '443') {
      return '';
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:5000`;
  }
  return 'http://localhost:5000';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor: attach token & active site header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vms_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const activeSiteId = localStorage.getItem('vms_active_site_id');
  if (activeSiteId) {
    config.headers['X-Site-Id'] = activeSiteId;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if unauthorized and not already on login
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/v/')) {
        localStorage.removeItem('vms_auth_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
