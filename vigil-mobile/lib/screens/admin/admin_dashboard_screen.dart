import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../profile_screen.dart';
import '../analytics/analytics_screen.dart';
import 'system_config_screen.dart';
import 'device_token_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({Key? key}) : super(key: key);

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  int totalVehicles = 0;
  int totalIncidents = 0;
  int totalDrivers = 0;
  int totalOfficers = 0;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    try {
      final results = await Future.wait([
        ApiService.getVehicles(),
        ApiService.getIncidents(),
        ApiService.getOfficers(),
      ]);
      final vehicles = results[0] as List;
      final incidents = results[1] as List;
      final officers = results[2] as List;
      if (mounted) {
        setState(() {
          totalVehicles = vehicles.length;
          totalIncidents = incidents.length;
          totalDrivers = vehicles.length;
          totalOfficers = officers.length;
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const ProfileScreen()),
              );
            },
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Admin Profile Card
                  Card(
                    color: AppTheme.bgCard,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: AppTheme.accentBlue,
                            radius: 28,
                            child: const Icon(Icons.admin_panel_settings, color: Colors.white, size: 32),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  AuthService.currentUser?.name ?? 'Admin',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                                ),
                                const Text(
                                  'Super Administrator',
                                  style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  const Text('SYSTEM OVERVIEW', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 12),

                  // Stats Grid
                  Row(
                    children: [
                      Expanded(child: _buildStatCard(Icons.directions_bus, 'Vehicles', totalVehicles.toString(), AppTheme.accentBlue)),
                      const SizedBox(width: 12),
                      Expanded(child: _buildStatCard(Icons.warning_amber, 'Incidents', totalIncidents.toString(), AppTheme.statusAmber)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _buildStatCard(Icons.people, 'Drivers', totalDrivers.toString(), AppTheme.statusGreen)),
                      const SizedBox(width: 12),
                      Expanded(child: _buildStatCard(Icons.security, 'Officers', totalOfficers.toString(), AppTheme.accentBlue)),
                    ],
                  ),
                  const SizedBox(height: 24),

                  const Text('QUICK ACTIONS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 12),

                  _buildActionCard(Icons.settings, 'System Configuration', 'Manage tenants, roles & platform settings', () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const SystemConfigScreen()));
                  }),
                  const SizedBox(height: 8),
                  _buildActionCard(Icons.analytics, 'Analytics & Reports', 'View fleet performance & incident analytics', () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const AnalyticsScreen()));
                  }),
                  const SizedBox(height: 8),
                  _buildActionCard(Icons.token, 'Device Token Management', 'Generate & manage IoT device tokens', () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const DeviceTokenScreen()));
                  }),
                ],
              ),
            ),
    );
  }

  Widget _buildStatCard(IconData icon, String label, String value, Color color) {
    return Card(
      color: AppTheme.bgCard,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildActionCard(IconData icon, String title, String subtitle, VoidCallback onTap) {
    return Card(
      color: AppTheme.bgCard,
      child: ListTile(
        leading: Icon(icon, color: AppTheme.accentBlue),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
        trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
        onTap: onTap,
      ),
    );
  }
}
