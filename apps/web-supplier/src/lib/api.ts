const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
const ACCESS_KEY = 'cscp_access';
const REFRESH_KEY = 'cscp_refresh';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  formData?: FormData;
  skipAuthRefresh?: boolean;
};

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await parseResponse(res);

  if (!res.ok || !data.accessToken) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('cscp_user');
    return null;
  }

  localStorage.setItem(ACCESS_KEY, data.accessToken);
  if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);

  return data.accessToken;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, token, formData, skipAuthRefresh = false } = options;
  const storedToken =
    typeof window !== 'undefined' ? localStorage.getItem(ACCESS_KEY) : null;
  const requestToken = token || storedToken || undefined;

  const headers: HeadersInit = {};
  if (requestToken) headers['Authorization'] = `Bearer ${requestToken}`;
  if (body && !formData) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ? formData : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('API server is unavailable. Make sure the backend is running on port 4001.');
  }

  let data = await parseResponse(res);

  if (res.status === 401 && !skipAuthRefresh && path !== '/auth/refresh') {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      const retryHeaders: HeadersInit = { ...headers, Authorization: `Bearer ${nextToken}` };
      let retry: Response;
      try {
        retry = await fetch(`${API_URL}${path}`, {
          method,
          headers: retryHeaders,
          body: formData ? formData : body ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new Error('API server is unavailable. Make sure the backend is running on port 4001.');
      }
      data = await parseResponse(retry);
      if (!retry.ok) {
        throw new Error(data.message || 'Request failed');
      }
      return data as T;
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data as T;
}

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  registerSupplier: (payload: {
    email: string;
    phone: string;
    password: string;
    businessName: string;
  }, documents: File[], storePhotos: File[] = []) => {
    const formData = new FormData();
    formData.append('email', payload.email);
    formData.append('phone', payload.phone);
    formData.append('password', payload.password);
    formData.append('businessName', payload.businessName);
    documents.forEach((doc) => formData.append('documents', doc));
    storePhotos.forEach((photo) => formData.append('storePhotos', photo));
    return apiRequest('/auth/register/supplier', { method: 'POST', formData });
  },

  login: (identifier: string, password: string) =>
    apiRequest<{ accessToken: string; refreshToken: string; user: any }>(
      '/auth/login',
      { method: 'POST', body: { identifier, password } },
    ),

  verifyOtp: (userId: string, code: string) =>
    apiRequest('/auth/verify-otp', { method: 'POST', body: { userId, code } }),

  resendOtp: (userId: string) =>
    apiRequest('/auth/resend-otp', { method: 'POST', body: { userId } }),

  refresh: (refreshToken: string) =>
    apiRequest<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken } },
    ),

  logout: (refreshToken: string) =>
    apiRequest('/auth/logout', { method: 'POST', body: { refreshToken } }),

  forgotPassword: (identifier: string) =>
    apiRequest<{ userId: string | null; message: string }>(
      '/auth/forgot-password',
      { method: 'POST', body: { identifier } },
    ),

  resetPassword: (userId: string, code: string, newPassword: string) =>
    apiRequest('/auth/reset-password', {
      method: 'POST',
      body: { userId, code, newPassword },
    }),

  getProfile: (token: string) =>
    apiRequest('/profile', { token }),
};

export const messagesApi = {
  listConversations: (token: string) =>
    apiRequest<any[]>('/messages/conversations', { token }),

  getConversationByOrder: (token: string, orderId: string) =>
    apiRequest<any>(`/messages/orders/${orderId}`, { token }),

  getConversation: (token: string, conversationId: string) =>
    apiRequest<any>(`/messages/conversations/${conversationId}`, { token }),

  sendMessage: (
    token: string,
    conversationId: string,
    payload: { content?: string; files?: File[] },
  ) => {
    const formData = new FormData();
    if (payload.content?.trim()) formData.append('content', payload.content.trim());
    (payload.files || []).forEach((file) => formData.append('attachments', file));
    return apiRequest<any>(`/messages/conversations/${conversationId}/messages`, {
      method: 'POST',
      token,
      formData,
    });
  },

  markConversationRead: (token: string, conversationId: string) =>
    apiRequest(`/messages/conversations/${conversationId}/read`, {
      method: 'POST',
      token,
    }),
};
