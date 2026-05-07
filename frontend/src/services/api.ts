import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

const api = axios.create({
  baseURL: configuredApiUrl || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gnp-auth');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong') {
  const message =
    (error as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response
      ?.data?.message ??
    (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message;

  return message || fallback;
}

export function getApiErrorDetails<T = unknown>(error: unknown): T | undefined {
  return (error as { response?: { data?: { error?: { details?: T } } } })?.response?.data?.error
    ?.details;
}

export default api;
