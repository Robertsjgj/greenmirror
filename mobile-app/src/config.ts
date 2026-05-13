const DEFAULT_API_BASE_URL = 'http://192.168.7.202:5000';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || DEFAULT_API_BASE_URL;

export const LATEST_READING_URL = `${API_BASE_URL}/api/latest`;
