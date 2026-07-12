function resolveApiBaseUrl(): string {
  const configuredUrl = (import.meta.env.VITE_API_URL as string) || "/api/v1";

  if (typeof window !== "undefined") {
    const localApiPath = resolveLocalApiPath(configuredUrl);
    if (localApiPath) {
      return localApiPath;
    }
  }

  return configuredUrl;
}

function resolveLocalApiPath(configuredUrl: string): string | null {
  try {
    const url = new URL(configuredUrl);
    if (!isLocalApiHostname(url.hostname)) {
      return null;
    }

    const path = normalizeLocalApiPath(url.pathname);
    return `${path}${url.search}`;
  } catch {
    return null;
  }
}

function normalizeLocalApiPath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/api/v1";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isLocalApiHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}

export const API_BASE_URL = resolveApiBaseUrl();

export const APP_ENV = (import.meta.env.MODE as string) || "development";
export const TERMS_URL =
  (import.meta.env.VITE_TERMS_URL as string | undefined) ??
  "https://trenova.app/legal/terms/";
export const PRIVACY_URL =
  (import.meta.env.VITE_PRIVACY_URL as string | undefined) ??
  "https://trenova.app/legal/privacy/";

export const US_CENTER = { lat: 39.8, lng: -98.5 };
export const DEFAULT_ZOOM = 4;
export const MAP_ID_LIGHT = import.meta.env.VITE_GOOGLE_MAPS_ID_LIGHT as string;
export const MAP_ID_DARK = import.meta.env.VITE_GOOGLE_MAPS_ID_DARK as string;

export const GOOGLE_MAPS_ERROR_MESSAGE = "GoogleMaps integration is not configured";
