import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
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
  List<Vehicle> filteredVehicles = [];
  List<Incident> activeIncidents = [];
  List<String> tenants = [];
  String? selectedTenant;
  bool isLoading = true;
  bool _showMap = true;
  late WebSocketService wsService;
  final MapController _mapController = MapController();

  static const LatLng _defaultCenter = LatLng(-6.9666, 110.4196);

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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('BARU: ${incident.vehicleCode} - ${incident.type}'),
            backgroundColor: AppTheme.statusAmber,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    };
    wsService.onVehiclesUpdate = (updatedVehicles) {
      setState(() {
        vehicles = updatedVehicles;
        _applyTenantFilter();
      });
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
          // Extract unique tenants from vehicles
          tenants = v.map((v) => v.id.split('-').first).toSet().toList()..sort();
          // Also try to get tenantId from user
          final userTenant = AuthService.currentUser?.tenantId;
          if (userTenant != null && !tenants.contains(userTenant)) {
            tenants.insert(0, userTenant);
          }
          selectedTenant = userTenant ?? (tenants.isNotEmpty ? tenants.first : null);
          activeIncidents = i.where((inc) => inc.status != 'RESOLVED').toList();
          _applyTenantFilter();
          isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => isLoading = false);
    }
  }

  void _applyTenantFilter() {
    if (selectedTenant == null) {
      filteredVehicles = List.from(vehicles);
    } else {
      filteredVehicles = vehicles.where((v) =>
        v.id.startsWith(selectedTenant!) ||
        v.name.toLowerCase().contains(selectedTenant!.toLowerCase())
      ).toList();
    }
    // If no match from ID prefix, show all
    if (filteredVehicles.isEmpty && selectedTenant != null) {
      filteredVehicles = List.from(vehicles);
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
            icon: Icon(_showMap ? Icons.list : Icons.map, color: AppTheme.textPrimary),
            onPressed: () => setState(() => _showMap = !_showMap),
            tooltip: _showMap ? 'Show List' : 'Show Map',
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: AppTheme.textPrimary),
            onPressed: _loadData,
          ),
          IconButton(
            icon: const Icon(Icons.person_outline, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
            },
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : _showMap ? _buildMapBody() : _buildListBody(),
    );
  }

  // ── MAP VIEW ────────────────────────────────────────────────────────────────

  Widget _buildMapBody() {
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _defaultCenter,
            initialZoom: 13,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
              subdomains: const ['a', 'b', 'c'],
              userAgentPackageName: 'com.vigilos.mobile',
            ),
            MarkerLayer(markers: _buildMarkers()),
          ],
        ),
        // Tenant dropdown overlay
        Positioned(
          top: 12,
          left: 12,
          right: 12,
          child: _buildTenantDropdown(),
        ),
        // Stats overlay
        Positioned(
          bottom: 16,
          left: 12,
          right: 12,
          child: _buildMapStatsBar(),
        ),
      ],
    );
  }

  Widget _buildTenantDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.business, color: AppTheme.accentBlue, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selectedTenant,
                dropdownColor: AppTheme.bgSecondary,
                isExpanded: true,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                hint: const Text('Select Tenant', style: TextStyle(color: AppTheme.textMuted)),
                items: [
                  const DropdownMenuItem(value: null, child: Text('All Tenants')),
                  ...tenants.map((t) => DropdownMenuItem(value: t, child: Text(t))),
                ],
                onChanged: (val) {
                  setState(() {
                    selectedTenant = val;
                    _applyTenantFilter();
                  });
                },
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.accentBlue.withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${filteredVehicles.length}',
              style: const TextStyle(color: AppTheme.accentBlue, fontWeight: FontWeight.bold, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  List<Marker> _buildMarkers() {
    return filteredVehicles.map((v) {
      final color = _getVehicleColor(v.status);
      return Marker(
        point: LatLng(v.lat, v.lng),
        width: 40,
        height: 40,
        child: GestureDetector(
          onTap: () => _showVehicleDetail(v),
          child: Container(
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [BoxShadow(color: color.withOpacity(0.5), blurRadius: 6)],
            ),
            child: const Icon(Icons.directions_bus, color: Colors.white, size: 20),
          ),
        ),
      );
    }).toList();
  }

  Widget _buildMapStatsBar() {
    final active = filteredVehicles.where((v) => v.status == 'ACTIVE').length;
    final alerts = filteredVehicles.where((v) => v.status == 'warning' || v.status == 'ALERT').length;
    final emergency = filteredVehicles.where((v) => v.status == 'emergency').length;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8)],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatPill(Icons.check_circle, 'Active', '$active', AppTheme.statusGreen),
          Container(width: 1, height: 24, color: AppTheme.textMuted.withOpacity(0.3)),
          _buildStatPill(Icons.warning, 'Alert', '$alerts', AppTheme.statusAmber),
          Container(width: 1, height: 24, color: AppTheme.textMuted.withOpacity(0.3)),
          _buildStatPill(Icons.error, 'Emergency', '$emergency', AppTheme.statusRed),
          Container(width: 1, height: 24, color: AppTheme.textMuted.withOpacity(0.3)),
          _buildStatPill(Icons.report_problem, 'Incidents', '${activeIncidents.length}', AppTheme.statusAmber),
        ],
      ),
    );
  }

  Widget _buildStatPill(IconData icon, String label, String value, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
      ],
    );
  }

  void _showVehicleDetail(Vehicle v) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgCard,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: _getVehicleColor(v.status).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.directions_bus, color: _getVehicleColor(v.status), size: 28),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(v.code, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                      Text(v.name, style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getVehicleColor(v.status).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(v.status.toUpperCase(), style: TextStyle(color: _getVehicleColor(v.status), fontWeight: FontWeight.bold, fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildDetailRow(Icons.person, 'Driver', v.driver),
            _buildDetailRow(Icons.speed, 'Speed', '${v.speed.toStringAsFixed(1)} km/h'),
            _buildDetailRow(Icons.straighten, 'Speed Limit', '${v.speedLimit.toStringAsFixed(0)} km/h'),
            _buildDetailRow(Icons.people, 'Passengers', '${v.passengers}'),
            _buildDetailRow(Icons.location_on, 'Position', '${v.lat.toStringAsFixed(4)}, ${v.lng.toStringAsFixed(4)}'),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, color: AppTheme.textMuted, size: 18),
          const SizedBox(width: 10),
          Text('$label: ', style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ],
      ),
    );
  }

  // ── LIST VIEW ───────────────────────────────────────────────────────────────

  Widget _buildListBody() {
    return SingleChildScrollView(
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
                        const Text('Command Center Operator', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Tenant filter
          _buildTenantDropdownList(),
          const SizedBox(height: 20),

          const Text('FLEET STATUS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _buildStatusCard('Active', filteredVehicles.where((v) => v.status == 'ACTIVE').length.toString(), AppTheme.statusGreen)),
              const SizedBox(width: 8),
              Expanded(child: _buildStatusCard('Alert', filteredVehicles.where((v) => v.status == 'warning' || v.status == 'ALERT').length.toString(), AppTheme.statusAmber)),
              const SizedBox(width: 8),
              Expanded(child: _buildStatusCard('Incidents', activeIncidents.length.toString(), AppTheme.statusRed)),
            ],
          ),
          const SizedBox(height: 20),

          const Text('FLEET LIST', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
          const SizedBox(height: 12),
          ...filteredVehicles.map((v) => _buildVehicleListCard(v)),

          const SizedBox(height: 20),
          const Text('ACTIVE INCIDENTS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
          const SizedBox(height: 12),
          if (activeIncidents.isEmpty)
            Card(
              color: AppTheme.bgCard,
              child: const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('No active incidents', style: TextStyle(color: AppTheme.textMuted))),
              ),
            )
          else
            ...activeIncidents.take(5).map((incident) => _buildIncidentCard(incident)),
        ],
      ),
    );
  }

  Widget _buildTenantDropdownList() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.business, color: AppTheme.accentBlue, size: 20),
          const SizedBox(width: 8),
          const Text('Tenant: ', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selectedTenant,
                dropdownColor: AppTheme.bgSecondary,
                isExpanded: true,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                items: [
                  const DropdownMenuItem(value: null, child: Text('All Tenants')),
                  ...tenants.map((t) => DropdownMenuItem(value: t, child: Text(t))),
                ],
                onChanged: (val) {
                  setState(() {
                    selectedTenant = val;
                    _applyTenantFilter();
                  });
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleListCard(Vehicle v) {
    final color = _getVehicleColor(v.status);
    return Card(
      color: AppTheme.bgCard,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(Icons.directions_bus, color: color, size: 24),
        ),
        title: Row(
          children: [
            Text(v.code, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: color.withOpacity(0.2), borderRadius: BorderRadius.circular(4)),
              child: Text(v.status.toUpperCase(), style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
        subtitle: Text('${v.name} • ${v.driver}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${v.speed.toStringAsFixed(0)} km/h', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14)),
            Text('${v.passengers} pax', style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
          ],
        ),
        onTap: () {
          setState(() => _showMap = true);
          Future.delayed(const Duration(milliseconds: 300), () {
            _mapController.move(LatLng(v.lat, v.lng), 15);
          });
        },
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
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
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
        subtitle: Text('${incident.vehicleCode} • ${incident.details}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: incident.severity == 'CRITICAL' ? AppTheme.statusRed.withOpacity(0.2) : AppTheme.statusAmber.withOpacity(0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(incident.severity, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: incident.severity == 'CRITICAL' ? AppTheme.statusRed : AppTheme.statusAmber)),
        ),
      ),
    );
  }

  Color _getVehicleColor(String status) {
    switch (status) {
      case 'emergency': return AppTheme.statusRed;
      case 'warning': case 'ALERT': return AppTheme.statusAmber;
      case 'ACTIVE': case 'normal': return AppTheme.statusGreen;
      case 'MAINTENANCE': return Colors.orange;
      case 'OFFLINE': case 'INACTIVE': return AppTheme.textMuted;
      default: return AppTheme.accentBlue;
    }
  }
}
