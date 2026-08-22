import api from './api';

const TOKEN_KEY = 'vigil_access_token';
const REFRESH_TOKEN_KEY = 'vigil_refresh_token';
const USER_KEY = 'vigil_user';

class AuthService {
  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    this.refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  }

  async login(email, password, tenantId) {
    try {
      const response = await api.post('/api/v1/auth/login', {
        email,
        password,
        tenantId
      });

      if (response.data.success) {
        const { token, refreshToken, user } = response.data.data;
        
        this.setTokens(token, refreshToken);
        this.setUser(user);
        
        return { success: true, user };
      }
      
      return { success: false, error: response.data.error };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  }

  async logout() {
    try {
      if (this.refreshToken) {
        await api.post('/api/v1/auth/logout', {
          refreshToken: this.refreshToken
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearTokens();
      this.clearUser();
    }
  }

  async refreshToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await api.post('/api/v1/auth/refresh', {
        refreshToken: this.refreshToken
      });

      if (response.data.success) {
        const { token, refreshToken } = response.data.data;
        this.setTokens(token, refreshToken);
        return token;
      }
      
      throw new Error('Token refresh failed');
    } catch (error) {
      this.clearTokens();
      throw error;
    }
  }

  setTokens(token, refreshToken) {
    this.token = token;
    this.refreshToken = refreshToken;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    
    // Set default authorization header
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
  }

  setUser(user) {
    this.user = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  clearUser() {
    this.user = null;
    localStorage.removeItem(USER_KEY);
  }

  getUser() {
    if (!this.user) {
      this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    }
    return this.user;
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  hasRole(role) {
    const user = this.getUser();
    return user?.role === role;
  }

  hasPermission(permission) {
    const user = this.getUser();
    return user?.permissions?.includes(permission) || false;
  }

  getTenantId() {
    const user = this.getUser();
    return user?.tenantId;
  }

  initialize() {
    if (this.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }
}

export default new AuthService();
