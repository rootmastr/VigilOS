import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../models/vehicle.dart';
import '../../models/incident.dart';
import '../../services/api_service.dart';
import '../../services/websocket_service.dart';
import '../../services/auth_service.dart';
import '../profile_screen.dart';

class OperatorDashboardScreen extends StatefulWidget {
  const OperatorDashboardScreen({Key? key}) : super(key: key);

  @override
  State<OperatorDashboardScreen> createState() => _OperatorDashboardScreenState();
}

class _OperatorDashboardScreenState extends State<OperatorDashboardScreen> {
  List<Vehicle> vehicles = [];
  List<Incident> activeIncidents = [];
  bool isLoading = true;
  late WebSocketService wsService;

  @override
  void initState() {
    super.initState();
    _loadData();
    _initWebSocket();
  }

  void _initWebSocket() {
    wsService = WebSocketService();
    wsService.onEmergencyAlert = (incident) {
      setState(() => activeIncidents.insert(0, incident));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('NEW INCIDENT: ${incident.vehicleCode} - ${incident.type}'),
          backgroundColor: AppTheme.statusAmber,
          duration: const Duration(seconds: 4),
        ),
      );
    };
    wsService.connect();
  }

  Future<void> _loadData() async {
    try {
      final v = await ApiService.getVehicles();
      final i = await ApiService.getIncidents();
      if (mounted) {
        setState(() {
          vehicles = v;
          activeIncidents = i.where((inc) => inc.status != 'RESOLVED').toList();
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  void dispose() {
    wsService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Command Center'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppTheme.textPrimary),
            onPressed: _loadData,
          ),
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
                  // Operator Info Card
                  Card(
                    color: AppTheme.bgCard,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: AppTheme.statusAmber,
                            radius: 28,
                            child: const Icon(Icons.headset_mic, color: Colors.white, size: 32),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  AuthService.currentUser?.name ?? 'Operator',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                                ),
                                const Text(
                                  'Command Center Operator',
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

                  const Text('FLEET STATUS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 12),

                  // Fleet Status Summary
                  Row(
                    children: [
                      Expanded(child: _buildStatusCard('Active', vehicles.where((v) => v.status == 'ACTIVE').length.toString(), AppTheme.statusGreen)),
                      const SizedBox(width: 8),
                      Expanded(child: _buildStatusCard('Alert', vehicles.where((v) => v.status == 'ALERT').length.toString(), AppTheme.statusAmber)),
                      const SizedBox(width: 8),
                      Expanded(child: _buildStatusCard('Incidents', activeIncidents.length.toString(), AppTheme.statusRed)),
                    ],
                  ),
                  const SizedBox(height: 20),

                  const Text('ACTIVE INCIDENTS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 12),

                  if (activeIncidents.isEmpty)
                    Card(
                      color: AppTheme.bgCard,
                      child: const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(
                          child: Text('No active incidents', style: TextStyle(color: AppTheme.textMuted)),
                        ),
                      ),
                    )
                  else
                    ...activeIncidents.take(5).map((incident) => _buildIncidentCard(incident)),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusCard(String label, String count, Color color) {
    return Card(
      color: AppTheme.bgCard,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(height: 8),
            Text(count, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildIncidentCard(Incident incident) {
    return Card(
      color: AppTheme.bgCard,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          incident.severity == 'CRITICAL' ? Icons.warning_amber : Icons.info_outline,
          color: incident.severity == 'CRITICAL' ? AppTheme.statusRed : AppTheme.statusAmber,
        ),
        title: Text(incident.type, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          '${incident.vehicleCode} • ${incident.details}',
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: incident.severity == 'CRITICAL'
                ? AppTheme.statusRed.withOpacity(0.2)
                : AppTheme.statusAmber.withOpacity(0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            incident.severity,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: incident.severity == 'CRITICAL' ? AppTheme.statusRed : AppTheme.statusAmber,
            ),
          ),
        ),
      ),
    );
  }
}
