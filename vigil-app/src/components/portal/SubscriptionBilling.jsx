import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle, Clock, ArrowUpCircle, Download } from 'lucide-react';

const BACKEND_URL = '';

const PLANS = [
  { id: 'BASIC', name: 'Basic', price: 5000000, deviceLimit: 10, features: ['Vehicle tracking', 'Basic alerts', 'Standard support'], color: 'var(--text-muted)' },
  { id: 'PRO', name: 'Pro', price: 18000000, deviceLimit: 30, features: ['Geofencing', 'Route deviation alerts', 'AI reports', 'Priority support'], color: 'var(--accent-blue)' },
  { id: 'ENTERPRISE', name: 'Enterprise', price: 45000000, deviceLimit: 100, features: ['Full API access', 'Webhooks', 'Custom integrations', '24/7 support', 'Dedicated account manager'], color: 'var(--status-green)' },
];

export default function SubscriptionBilling({ user: _user }) {
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const [subRes, invRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/v1/portal/subscriptions`, { headers }),
        fetch(`${BACKEND_URL}/api/v1/portal/invoices`, { headers }),
      ]);
      const [subData, invData] = await Promise.all([subRes.json(), invRes.json()]);
      if (subData.success && subData.data.length > 0) setSubscription(subData.data[0]);
      if (invData.success) setInvoices(invData.data);
    } catch (e) {
      setSubscription({ id: 'sub-001', planTier: 'ENTERPRISE', status: 'ACTIVE', pricePerMonth: 45000000, deviceLimit: 100, currentPeriodEnd: '2024-09-01T00:00:00Z' });
      setInvoices([
        { id: 'INV-2024-001', invoiceNumber: 'VGL-2024-08-001', amount: 45000000, status: 'PAID', paidAt: '2024-08-05T10:30:00Z' },
        { id: 'INV-2024-003', invoiceNumber: 'VGL-2024-09-001', amount: 45000000, status: 'PENDING', dueAt: '2024-09-15T00:00:00Z' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (newPlan) => {
    setPendingPlan(newPlan);
    setShowConfirmModal(true);
  };

  const confirmPlanChange = async () => {
    if (!subscription || !pendingPlan) return;
    try {
      const token = localStorage.getItem('vigil_access_token');
      await fetch(`${BACKEND_URL}/api/v1/portal/subscriptions/${subscription.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planTier: pendingPlan }),
      });
    } catch (e) {}
    const plan = PLANS.find(p => p.id === pendingPlan);
    setSubscription(prev => ({ ...prev, planTier: pendingPlan, pricePerMonth: plan.price, deviceLimit: plan.deviceLimit }));
    showToast(`Upgraded to ${pendingPlan} plan`);
    setShowConfirmModal(false);
    setPendingPlan(null);
  };

  const downloadPDF = async (invId) => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      const res = await fetch(`${BACKEND_URL}/api/v1/portal/invoices/${invId}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('PDF downloaded');
      }
    } catch (e) {
      showToast('PDF download failed');
    }
  };

  const handlePayInvoice = async (invId) => {
    try {
      const token = localStorage.getItem('vigil_access_token');
      await fetch(`${BACKEND_URL}/api/v1/portal/invoices/${invId}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'Virtual Account' }),
      });
    } catch (e) {}
    setInvoices(prev => prev.map(i => i.id === invId ? { ...i, status: 'PAID', paidAt: new Date().toISOString() } : i));
    showToast('Invoice marked as paid');
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  if (loading) return <div className="portal-page"><div className="portal-loading">Loading...</div></div>;

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <div>
          <h1 className="portal-page-title">Billing & Subscriptions</h1>
          <p className="portal-page-subtitle">Manage your subscription plan and invoices</p>
        </div>
      </div>

      <div className="portal-page-body">
        {/* Plan Cards */}
        <div className="portal-plans-grid">
          {PLANS.map(plan => {
            const isCurrent = subscription?.planTier === plan.id;
            return (
              <div key={plan.id} className={`portal-plan-card${isCurrent ? ' current' : ''}`} style={{ borderColor: isCurrent ? plan.color : undefined }}>
                {isCurrent && <div className="portal-plan-current-badge">Current Plan</div>}
                <div className="portal-plan-name" style={{ color: plan.color }}>{plan.name}</div>
                <div className="portal-plan-price">
                  <span className="portal-plan-currency">Rp</span>
                  <span className="portal-plan-amount">{(plan.price / 1000000).toFixed(0)}M</span>
                  <span className="portal-plan-period">/month</span>
                </div>
                <div className="portal-plan-devices">{plan.deviceLimit} device tokens included</div>
                <ul className="portal-plan-features">
                  {plan.features.map((f, i) => (
                    <li key={i}><CheckCircle size={13} /> {f}</li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button className="btn btn-primary w-full" onClick={() => handleUpgrade(plan.id)} style={{ marginTop: 'auto' }}>
                    <ArrowUpCircle size={15} /> Upgrade
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Invoices */}
        <div className="portal-card" style={{ marginTop: 20 }}>
          <div className="portal-card-header">
            <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
            <span className="portal-card-title">Invoice History</span>
          </div>
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td className="mono fw-700">Rp {(inv.amount / 1000000).toFixed(0)}M</td>
                    <td>
                      <span className={`badge badge-${inv.status === 'PAID' ? 'green' : inv.status === 'PENDING' ? 'amber' : 'red'}`}>
                        {inv.status === 'PAID' && <CheckCircle size={11} />}
                        {inv.status === 'PENDING' && <Clock size={11} />}
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {inv.paidAt ? `Paid ${new Date(inv.paidAt).toLocaleDateString()}` : `Due ${new Date(inv.dueAt).toLocaleDateString()}`}
                    </td>
                    <td>
                      {inv.status === 'PENDING' && (
                        <button className="btn btn-sm btn-success" onClick={() => handlePayInvoice(inv.id)}>Pay Now</button>
                      )}
                      <button className="btn btn-sm btn-ghost" style={{ marginLeft: 4 }} onClick={() => downloadPDF(inv.id)}>
                        <Download size={13} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="portal-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="portal-modal-title">Confirm Plan Change</h3>
            <div className="portal-modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                You are about to change your plan to <strong style={{ color: 'var(--accent-blue)' }}>{pendingPlan}</strong>.
                {subscription?.planTier === 'ENTERPRISE' && pendingPlan !== 'ENTERPRISE'
                  ? ' Downgrading may result in loss of access to certain features.'
                  : ' Upgrading will give you access to more features and devices.'}
              </p>
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>New Plan</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{pendingPlan}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Monthly Cost</span>
                  <span style={{ fontWeight: 700 }}>Rp {((PLANS.find(p => p.id === pendingPlan)?.price || 0) / 1000000).toFixed(0)}M</span>
                </div>
              </div>
            </div>
            <div className="portal-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPlanChange}>Confirm Change</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="portal-toast">{toast}</div>}
    </div>
  );
}
