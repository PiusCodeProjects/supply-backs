const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  formData?: FormData;
};

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, token, formData } = options;

  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !formData) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ? formData : body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error("We can't reach our servers right now. Please check your internet connection and try again.");
  }

  if (res.status === 401 && !path.includes('/auth/login')) {
    if (typeof window !== 'undefined') {
      import('./auth').then(({ clearAuth }) => {
        clearAuth();
        window.location.href = '/login';
      });
    }
    throw new Error('Your session has ended. Please sign in again to continue.');
  }

  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again in a moment.');
  }

  return data as T;
}

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  registerContractor: (payload: {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    company?: string;
  }) => apiRequest('/auth/register/contractor', { method: 'POST', body: payload }),

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

export const logisticsApi = {
  getDriverOrders: (token: string) => 
    apiRequest<any[]>('/orders/driver', { token }),

  updateStatus: (token: string, orderId: string, action: string) =>
    apiRequest(`/orders/${orderId}/${action}`, { method: 'PATCH', token }),

  submitPod: (token: string, orderId: string, podData: any) =>
    apiRequest(`/orders/${orderId}/driver-submit-pod`, { 
      method: 'PATCH', 
      token, 
      body: podData 
    }),
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
