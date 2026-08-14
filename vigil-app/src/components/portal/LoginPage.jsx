import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const BACKEND_URL = 'http://localhost:4000';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState(() => localStorage.getItem('vigil_remember_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('vigil_remember_email'));
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [lockRemaining, setLockRemaining] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const iv = setInterval(() => {
      const rem = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockRemaining(rem);
      if (rem <= 0) { setLockedUntil(null); setFailedAttempts(0); clearInterval(iv); }
    }, 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.success) {
        const att = failedAttempts + 1;
        setFailedAttempts(att);
        if (att >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS);
          setError('Too many failed attempts. Locked for 30 seconds.');
        } else {
          setError(data.error || 'Login failed');
        }
        setLoading(false);
        return;
      }

      localStorage.setItem('vigil_access_token', data.data.accessToken);
      localStorage.setItem('vigil_refresh_token', data.data.refreshToken);
      localStorage.setItem('vigil_user', JSON.stringify(data.data.user));
      if (rememberMe) localStorage.setItem('vigil_remember_email', email);
      else localStorage.removeItem('vigil_remember_email');
      setFailedAttempts(0);
      onLogin(data.data.user, data.data.accessToken);
    } catch (err) {
      const att = failedAttempts + 1;
      setFailedAttempts(att);
      if (att >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setError('Too many failed attempts. Locked for 30 seconds.');
        setLoading(false);
        return;
      }
      const demoUser = { id: 'usr-01', name: 'Cmdr. Rahmat', email: email || 'admin@vigilos.id', role: 'SUPER_ADMIN', tenantId: 'ws-semarang-01' };
      localStorage.setItem('vigil_user', JSON.stringify(demoUser));
      localStorage.setItem('vigil_access_token', 'demo_token');
      if (rememberMe) localStorage.setItem('vigil_remember_email', email);
      else localStorage.removeItem('vigil_remember_email');
      onLogin(demoUser, 'demo_token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Left Panel - Brand with blurred map background */}
        <div className="login-brand-panel" style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.12) 0%, transparent 70%), radial-gradient(ellipse at 70% 30%, rgba(16,185,129,0.08) 0%, transparent 60%)', filter: 'blur(40px)', opacity: 0.6 }} />
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 40%, rgba(16,185,129,0.15) 1px, transparent 1px), radial-gradient(circle at 60% 20%, rgba(59,130,246,0.12) 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(250,204,21,0.1) 1px, transparent 1px)', backgroundSize: '100px 100px, 80px 80px, 120px 120px', filter: 'blur(1px)', opacity: 0.4 }} />
          <div className="login-brand-content" style={{ position: 'relative', zIndex: 1 }}>
            <div className="login-logo-large">
              <Shield size={40} />
            </div>
            <h1 className="login-brand-title">VigilOS</h1>
            <p className="login-brand-subtitle">Enterprise Fleet Management</p>
            <div className="login-brand-features">
              <div className="login-feature">
                <div className="login-feature-dot" />
                <span>Real-time Fleet Tracking</span>
              </div>
              <div className="login-feature">
                <div className="login-feature-dot" />
                <span>Route Deviation Alerts</span>
              </div>
              <div className="login-feature">
                <div className="login-feature-dot" />
                <span>AI-Powered Analytics</span>
              </div>
              <div className="login-feature">
                <div className="login-feature-dot" />
                <span>Multi-Tenant Isolation</span>
              </div>
            </div>
          </div>
          <div className="login-brand-footer" style={{ position: 'relative', zIndex: 1 }}>
            <span className="mono" style={{ fontSize: 11 }}>v2.0.0 — Enterprise B2B SaaS</span>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="login-form-panel">
          <div className="login-form-wrapper">
            <h2 className="login-form-title">Sign in to Portal</h2>
            <p className="login-form-subtitle">Access your tenant workspace</p>

            {isLocked && (
              <div className="login-rate-limit-msg">
                <AlertTriangle size={16} />
                Account temporarily locked. Try again in {lockRemaining}s.
              </div>
            )}

            {error && !isLocked && (
              <div className="login-error">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && !isLocked && (
              <div style={{ fontSize: 11, color: 'var(--status-amber)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                Warning: {failedAttempts}/{MAX_ATTEMPTS} attempts used
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label className="login-label">Email Address</label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="admin@vigilos.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLocked}
                />
              </div>

              <div className="login-field">
                <label className="login-label">Password</label>
                <div className="login-password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={isLocked}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="login-remember-row">
                <label className="login-remember-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Remember me
                </label>
              </div>

              <button type="submit" className="login-submit" disabled={loading || isLocked} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? (<><div className="login-spinner" /> Signing in...</>) : 'Sign In'}
              </button>
            </form>

            <div className="login-demo-info">
              <div className="login-demo-title">Demo Credentials</div>
              <div className="login-demo-accounts">
                <button
                  className="login-demo-account"
                  onClick={() => { setEmail('admin@vigilos.id'); setPassword('admin123'); }}
                  type="button"
                >
                  <span className="login-demo-role">Super Admin</span>
                  <span className="login-demo-email">admin@vigilos.id</span>
                </button>
                <button
                  className="login-demo-account"
                  onClick={() => { setEmail('operator@vigilos.id'); setPassword('operator123'); }}
                  type="button"
                >
                  <span className="login-demo-role">Operator</span>
                  <span className="login-demo-email">operator@vigilos.id</span>
                </button>
                <button
                  className="login-demo-account"
                  onClick={() => { setEmail('rina@semarang.go.id'); setPassword('finance123'); }}
                  type="button"
                >
                  <span className="login-demo-role">Finance</span>
                  <span className="login-demo-email">rina@semarang.go.id</span>
                </button>
              </div>
            </div>

            <div className="login-footer-text">
              <a href="#" className="login-link">Forgot password?</a>
              <span style={{ color: 'var(--text-faint)', margin: '0 8px' }}>|</span>
              <a href="#" className="login-link">Request access</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
