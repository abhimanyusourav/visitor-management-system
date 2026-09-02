/**
 * Resolves a visitor photo URL (handles relative /api paths, absolute URLs, and base64 data URIs)
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  const trimmed = url.trim();

  // If it's already a base64 data URL, blob or absolute URL
  if (
    trimmed.startsWith('data:image') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // If it's an external URL without our storage path
  if (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.includes('/api/storage/')
  ) {
    return trimmed;
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vms_auth_token') : null;

  // If it's a relative path from backend (e.g. /api/storage/visitors/photo.jpg)
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  let fullUrl = cleanPath;

  if (typeof window !== 'undefined') {
    // In local dev server (port 5173 -> target backend port 5000)
    if (window.location.port === '5173') {
      fullUrl = `${window.location.protocol}//${window.location.hostname}:5000${cleanPath}`;
    }
  }

  // Attach token parameter if accessing storage API so standard <img> tags can authenticate
  if (token && (fullUrl.includes('/api/storage/') || trimmed.includes('/api/storage/'))) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}

