import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vigil_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    
    if ((status === 401 || status === 403) && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('vigil_refresh_token');
        if (refreshToken) {
          const response = await axios.post('/api/v1/auth/refresh', { refreshToken });
          const { accessToken } = response.data.data;
          localStorage.setItem('vigil_access_token', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Fall through to clear auth
      }
      
      localStorage.removeItem('vigil_access_token');
      localStorage.removeItem('vigil_refresh_token');
      localStorage.removeItem('vigil_user');
      window.location.href = '/';
    }
    
    return Promise.reject(error);
  }
);

export default api;
