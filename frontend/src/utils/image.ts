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
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // If it's a relative path from backend (e.g. /api/storage/visitors/photo.jpg)
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  if (typeof window !== 'undefined') {
    // In local dev server (port 5173 -> target backend port 5000)
    if (window.location.port === '5173') {
      return `${window.location.protocol}//${window.location.hostname}:5000${cleanPath}`;
    }
    // In production / reverse proxy on port 80/443, use relative path directly
    return cleanPath;
  }

  return cleanPath;
}

