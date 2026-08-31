import React, { useState, useCallback } from 'react';
import TopHeader from './components/layout/TopHeader';
import Sidebar from './components/layout/Sidebar';
import LiveMap from './components/map/LiveMap';
import EmergencyModal from './components/alerts/EmergencyModal';
import RouteDeviationModal from './components/alerts/RouteDeviationModal';
import TrafficAnalytics from './components/pages/TrafficAnalytics';
import IncidentLogs from './components/pages/IncidentLogs';
import FleetAdmin from './components/pages/FleetAdmin';
import PublicTransit from './components/pages/PublicTransit';
import PatrolOfficer from './components/pages/PatrolOfficer';
import LoginPage from './components/portal/LoginPage';
import PortalLayout, { canAccessPortal, canAccessPage, getDefaultPortalPage } from './components/portal/PortalLayout';
import PortalDashboard from './components/portal/PortalDashboard';
import TeamManagement from './components/portal/TeamManagement';
import SubscriptionBilling from './components/portal/SubscriptionBilling';
import SLACompliance from './components/portal/SLACompliance';
import APIKeys from './components/portal/APIKeys';
import TenantSettings from './components/portal/TenantSettings';
import FeatureManagement from './components/portal/FeatureManagement';
import TenantManagement from './components/portal/TenantManagement';
import TenantDetail from './components/portal/TenantDetail';
import ProvisioningWizard from './components/portal/ProvisioningWizard';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioAlarm } from './hooks/useAudioAlarm';
import { AlertTriangle, Bell } from 'lucide-react';

const PORTAL_PAGES = ['portal-dashboard', 'portal-team', 'portal-billing', 'portal-sla', 'portal-apikeys', 'portal-settings', 'portal-features', 'portal-tenants', 'portal-tenant-detail'];

export default function App() {
  const [authUser, setAuthUser] = useState(() => {
    try {
      const saved = localStorage.getItem('vigil_user');
      const token = localStorage.getItem('vigil_access_token');
      if (!saved || !token) {
        localStorage.removeItem('vigil_user');
        localStorage.removeItem('vigil_access_token');
        localStorage.removeItem('vigil_refresh_token');
        return null;
      }
      return JSON.parse(saved);
    } catch { return null; }
  });
  const [activePage, setActivePage] = useState('map');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [emergencyQueue, setEmergencyQueue] = useState([]);
  const [activeEmergencyIndex, setActiveEmergencyIndex] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [toastType, setToastType] = useState('info');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentTenant, setCurrentTenant] = useState(() => {
    return localStorage.getItem('vigil_current_tenant') || 'ws-semarang-01';
  });

  const handleTenantSwitch = useCallback((tenantId) => {
    setCurrentTenant(tenantId);
    localStorage.setItem('vigil_current_tenant', tenantId);
  }, []);
  const [routeDeviationModal, setRouteDeviationModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [wizardComplete, setWizardComplete] = useState(null);

  const { playAlarm } = useAudioAlarm();

  // Emergency handler — adds to queue
  const handleEmergency = useCallback((vehicle) => {
    setEmergencyQueue(prev => {
      const exists = prev.some(e => e.id === vehicle.id);
      if (exists) return prev;
      return [...prev, { ...vehicle, _queueTime: Date.now() }];
    });
    playAlarm();
    setActivePage('map');
  }, [playAlarm]);

  // Resolve emergency from queue
  const handleModalResolve = useCallback((reason) => {
    setEmergencyQueue(prev => {
      const resolved = prev[activeEmergencyIndex];
      if (resolved) {
        resolveEmergency(resolved.id);
        showToast(`✓ Incident ${resolved.id} resolved — audit log recorded`);
      }
      return prev.filter((_, i) => i !== activeEmergencyIndex);
    });
    setActiveEmergencyIndex(prev => {
      const newQueue = emergencyQueue.filter((_, i) => i !== activeEmergencyIndex);
      return Math.min(prev, Math.max(0, newQueue.length - 1));
    });
  }, [activeEmergencyIndex, emergencyQueue]);

  // Acknowledge emergency (stops alarm, keeps modal)
  const handleModalAcknowledge = useCallback(() => {
    showToast('✓ Incident acknowledged — alarm stopped');
  }, []);

  // Switch active emergency in queue
  const handleQueueSelect = useCallback((index) => {
    setActiveEmergencyIndex(index);
  }, []);

  // Route deviation handler (3-state workflow)
  const handleRouteDeviation = useCallback((deviation) => {
    setActivePage('map');

    if (deviation.severity === 'warning') {
      showToast(`⚠ Route Deviation WARNING: ${deviation.vehicleId} — ${deviation.deviationMeters}m from ${deviation.route}`, 'warning');
    } else if (deviation.severity === 'critical') {
      setRouteDeviationModal({
        ...deviation,
        vehicle: {
          id: deviation.vehicleId,
          lat: deviation.lat,
          lng: deviation.lng,
          route: deviation.route,
        },
      });
      playAlarm();
    }
  }, [playAlarm]);

  const {
    vehicles,
    drivers,
    officers,
    connected,
    incidents,
    resolveEmergency,
    resolveEmergencyWithReport,
    resolveRouteDeviation,
    updateOfficerStatus,
    triggerRandomEmergency,
    addVehicle,
    addDriver,
    deleteVehicle,
    deleteDriver,
    deviceTokens,
    securityEvents,
    routeDeviations,
    generateToken,
    revokeToken,
    rotateToken,
    deleteToken
  } = useWebSocket(handleEmergency, handleRouteDeviation, currentTenant);

  // Confirmation modal for destructive actions
  const showConfirm = useCallback((title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirmModal?.onConfirm) confirmModal.onConfirm();
    setConfirmModal(null);
  }, [confirmModal]);

  // Route Deviation modal handlers
  const handleDeviationModalClose = useCallback(() => {
    setRouteDeviationModal(null);
  }, []);

  const handleDeviationResolve = useCallback((deviation, resolutionReason) => {
    resolveRouteDeviation(deviation, resolutionReason);
    setRouteDeviationModal(null);
    showToast(`✓ Route Deviation ${deviation.vehicleId} resolved — audit log recorded`);
  }, [resolveRouteDeviation]);

  // Toast notification — 8s for warning per PRD
  const showToast = (msg, type = 'info') => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(null), type === 'warning' ? 8000 : 3000);
  };

  // Test emergency from sidebar panic button
  const handleTestEmergency = useCallback(() => {
    triggerRandomEmergency();
    showToast('🚨 Emergency alert triggered (simulation)', 'critical');
  }, [triggerRandomEmergency]);

  const handleVehicleClick = useCallback((vehicle) => {
    const latest = vehicles.find(v => v.id === vehicle.id) || vehicle;
    setSelectedVehicle(latest);
  }, [vehicles]);

  // Keep selected vehicle data live
  const liveSelectedVehicle = selectedVehicle
    ? vehicles.find(v => v.id === selectedVehicle.id) || selectedVehicle
    : null;

  const activeUnits = vehicles.filter(v => v.status !== 'idle').length;

  // Auth handlers
  const handleLogin = useCallback((user, _token) => {
    setAuthUser(user);
    if (user?.tenantId) {
      setCurrentTenant(user.tenantId);
      localStorage.setItem('vigil_current_tenant', user.tenantId);
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('vigil_access_token');
    localStorage.removeItem('vigil_refresh_token');
    localStorage.removeItem('vigil_user');
    setAuthUser(null);
    setActivePage('map');
  }, []);

  const isPortalPage = PORTAL_PAGES.includes(activePage);
  const userRole = authUser?.role || 'PUBLIC_USER';
  const hasPortalAccess = canAccessPortal(userRole);

  if (isPortalPage && !hasPortalAccess) {
    setActivePage('map');
  }
  if (isPortalPage && hasPortalAccess && !canAccessPage(userRole, activePage)) {
    const defaultPage = getDefaultPortalPage(userRole);
    if (defaultPage) {
      setActivePage(defaultPage);
    } else {
      setActivePage('map');
    }
  }

  // Login page
  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Portal view
  if (isPortalPage && hasPortalAccess) {
    return (
      <PortalLayout
        activePage={activePage}
        onNavigate={setActivePage}
        user={authUser}
        onLogout={handleLogout}
        onSwitchToCommand={() => setActivePage('map')}
      >
        {activePage === 'portal-dashboard' && canAccessPage(userRole, 'portal-dashboard') && <PortalDashboard user={authUser} />}
        {activePage === 'portal-team' && canAccessPage(userRole, 'portal-team') && <TeamManagement user={authUser} />}
        {activePage === 'portal-billing' && canAccessPage(userRole, 'portal-billing') && <SubscriptionBilling user={authUser} />}
        {activePage === 'portal-sla' && canAccessPage(userRole, 'portal-sla') && <SLACompliance user={authUser} />}
        {activePage === 'portal-apikeys' && canAccessPage(userRole, 'portal-apikeys') && <APIKeys user={authUser} />}
        {activePage === 'portal-settings' && canAccessPage(userRole, 'portal-settings') && <TenantSettings user={authUser} />}
        {activePage === 'portal-features' && canAccessPage(userRole, 'portal-features') && <FeatureManagement user={authUser} />}
        {activePage === 'portal-tenants' && canAccessPage(userRole, 'portal-tenants') && !showWizard && !selectedTenantId && (
          <TenantManagement
            user={authUser}
            onSelectTenant={(id) => { setSelectedTenantId(id); setActivePage('portal-tenant-detail'); }}
            onAddNew={() => setShowWizard(true)}
            showToast={showToast}
          />
        )}
        {activePage === 'portal-tenant-detail' && selectedTenantId && (
          <TenantDetail
            tenantId={selectedTenantId}
            onBack={() => { setSelectedTenantId(null); setActivePage('portal-tenants'); }}
            onManageSettings={() => setActivePage('portal-settings')}
            onManageFeatures={() => setActivePage('portal-features')}
            showToast={showToast}
          />
        )}
        {showWizard && (
          <ProvisioningWizard
            onClose={() => setShowWizard(false)}
            onComplete={(data) => {
              setShowWizard(false);
              showToast?.('Tenant published successfully!');
              setActivePage('portal-tenants');
            }}
            showToast={showToast}
          />
        )}
      </PortalLayout>
    );
  }

  // Command Center view
  return (
    <div className="app-shell">
      <TopHeader
        activeUnits={activeUnits}
        operatorCount={3}
        connected={connected}
        currentTenant={currentTenant}
        onTenantSwitch={handleTenantSwitch}
        sidebarCollapsed={sidebarCollapsed}
        user={authUser}
        onLogout={handleLogout}
        onSwitchToPortal={() => setActivePage('portal-dashboard')}
      />

      <div className="app-body">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onTestEmergency={handleTestEmergency}
          user={authUser}
        />

        <main className="main-content">
          {activePage === 'map' && (
            <LiveMap
              vehicles={vehicles}
              onVehicleClick={handleVehicleClick}
              selectedVehicle={liveSelectedVehicle}
              onCloseDrawer={() => setSelectedVehicle(null)}
              routeDeviations={routeDeviations}
              connected={connected}
              tenantId={currentTenant}
            />
          )}
          {activePage === 'dashboard' && <TrafficAnalytics />}
          {activePage === 'transit' && (
            <PublicTransit
              vehicles={vehicles}
              onTriggerPanic={(vId, details) => {
                triggerRandomEmergency(vId, details);
                showToast(`🚨 Passenger Panic Alert dispatched for ${vId}`, 'critical');
              }}
            />
          )}
          {activePage === 'patrol' && (
            <PatrolOfficer
              officers={officers}
              incidents={incidents}
              onUpdateOfficerStatus={(offId, status) => {
                updateOfficerStatus(offId, status);
                showToast(`Status updated to ${status}`);
              }}
              onResolveWithReport={(vId, incId, report) => {
                resolveEmergencyWithReport(vId, incId, report);
                showToast(`✓ Field Report submitted & Incident ${incId} resolved`);
              }}
            />
          )}
          {activePage === 'analytics' && <TrafficAnalytics />}
          {activePage === 'incidents' && <IncidentLogs />}
          {activePage === 'reports' && <TrafficAnalytics />}
          {activePage === 'settings' && (
            <div className="page">
              <div className="page-header">
                <div>
                  <div className="page-title">Tenant Settings</div>
                  <div className="page-subtitle">Manage workspace configuration and permissions</div>
                </div>
              </div>
              <div className="page-body">
                <div className="card" style={{ maxWidth: 480 }}>
                  <div className="card-header">
                    <div className="card-title">Workspace</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    <div><strong>Tenant ID:</strong> <span className="mono">{currentTenant}</span></div>
                    <div><strong>Region:</strong> Jawa Tengah</div>
                    <div><strong>Fleet Size:</strong> {vehicles.length} units</div>
                    <div><strong>Active Routes:</strong> 6 corridors</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activePage === 'fleet' && (
            <FleetAdmin
              vehicles={vehicles}
              drivers={drivers}
              onAddVehicle={async (data) => {
                const res = await addVehicle(data);
                showToast(`✓ Vehicle ${data.code || data.id} registered`);
                return res;
              }}
              onAddDriver={async (data) => {
                const res = await addDriver(data);
                showToast(`✓ Driver ${data.name} registered`);
                return res;
              }}
              onDeleteVehicle={(id) => {
                showConfirm(
                  'Delete Vehicle',
                  `Are you sure you want to permanently delete vehicle ${id}? This action cannot be undone.`,
                  async () => {
                    try {
                      await deleteVehicle(id);
                      showToast(`🗑️ Vehicle ${id} deleted`);
                    } catch (e) {
                      const msg = e.response?.data?.error || e.message || 'Delete failed';
                      showToast(`❌ ${msg}`);
                    }
                  }
                );
              }}
              onDeleteDriver={(id) => {
                showConfirm(
                  'Delete Driver',
                  `Are you sure you want to permanently delete this driver record? This action cannot be undone.`,
                  async () => {
                    try {
                      await deleteDriver(id);
                      showToast(`🗑️ Driver ${id} deleted`);
                    } catch (e) {
                      const msg = e.response?.data?.error || e.message || 'Delete failed';
                      showToast(`❌ ${msg}`);
                    }
                  }
                );
              }}
              tokens={deviceTokens}
              securityEvents={securityEvents}
              onGenerateToken={async (deviceId, expiryDays) => {
                const token = await generateToken(deviceId, expiryDays);
                showToast(`🔑 Token issued & bound to ${token.deviceId}`);
                return token;
              }}
              onRevokeToken={async (tokenId) => {
                showConfirm(
                  'Revoke Token',
                  'Revoking this token will immediately disconnect the bound device. Continue?',
                  async () => {
                    const token = await revokeToken(tokenId);
                    showToast(`🔒 Token for ${token.deviceId} revoked`);
                    return token;
                  }
                );
              }}
              onRotateToken={async (deviceId) => {
                const token = await rotateToken(deviceId);
                showToast(`🔄 Token rotated for ${token.deviceId}`);
                return token;
              }}
              onDeleteToken={(tokenId) => {
                showConfirm(
                  'Delete Token',
                  'This will permanently remove this token. The bound device will lose access. Continue?',
                  async () => {
                    await deleteToken(tokenId);
                    showToast(`🗑️ Token ${tokenId} deleted`);
                  }
                );
              }}
            />
          )}
        </main>
      </div>

      {/* Emergency Modal — Queue-based */}
      {emergencyQueue.length > 0 && (
        <EmergencyModal
          vehicle={emergencyQueue[activeEmergencyIndex]}
          queue={emergencyQueue}
          activeIndex={activeEmergencyIndex}
          onQueueSelect={handleQueueSelect}
          onAcknowledge={handleModalAcknowledge}
          onResolve={handleModalResolve}
        />
      )}

      {/* Route Deviation Modal (Critical) */}
      {routeDeviationModal && (
        <RouteDeviationModal
          deviation={routeDeviationModal}
          onClose={handleDeviationModalClose}
          onResolve={handleDeviationResolve}
        />
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-title">{confirmModal.title}</div>
            <div className="confirm-modal-message">{confirmModal.message}</div>
            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirm} style={{
                background: 'var(--status-red)',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className={`toast-notification toast-${toastType}`} style={{
          position: 'fixed',
          bottom: 24,
          ...(toastType === 'warning' || toastType === 'critical'
            ? { right: 24 }
            : { left: '50%', transform: 'translateX(-50%)' }
          ),
          background: toastType === 'warning'
            ? 'linear-gradient(135deg, #78350f, #92400e)'
            : toastType === 'critical'
              ? 'linear-gradient(135deg, #7f1d1d, #991b1b)'
              : 'var(--bg-card)',
          border: `1px solid ${
            toastType === 'warning'
              ? 'rgba(250, 204, 21, 0.4)'
              : toastType === 'critical'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'var(--border-accent)'
          }`,
          borderRadius: 10,
          padding: '10px 16px',
          color: toastType === 'warning'
            ? '#fde047'
            : toastType === 'critical'
              ? '#fca5a5'
              : 'var(--text-primary)',
          fontWeight: 500,
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: toastType === 'warning'
            ? '0 0 20px rgba(250, 204, 21, 0.2), 0 8px 40px rgba(0,0,0,0.6)'
            : toastType === 'critical'
              ? '0 0 20px rgba(239, 68, 68, 0.3), 0 8px 40px rgba(0,0,0,0.6)'
              : 'var(--shadow-elevated)',
          animation: 'fade-in 250ms ease',
          maxWidth: 480,
          fontFamily: toastType !== 'info' ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: toastType !== 'info' ? 12 : 13,
        }}>
          {toastType === 'warning' && <AlertTriangle size={14} style={{ color: '#facc15', flexShrink: 0 }} />}
          {toastType === 'critical' && <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />}
          {toastType === 'info' && <Bell size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />}
          {toastMsg}
        </div>
      )}
    </div>
  );
}
