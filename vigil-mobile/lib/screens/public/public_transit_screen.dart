import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../theme/app_theme.dart';
import '../../models/vehicle.dart';
import '../../services/api_service.dart';
import '../profile_screen.dart';
import '../public/panic_status_screen.dart';
import '../public/route_planner_screen.dart';

class PublicTransitScreen extends StatefulWidget {
  const PublicTransitScreen({Key? key}) : super(key: key);

  @override
  State<PublicTransitScreen> createState() => _PublicTransitScreenState();
}

class _PublicTransitScreenState extends State<PublicTransitScreen> {
  List<Vehicle> vehicles = [];
  List<Vehicle> filteredVehicles = [];
  bool isLoading = true;
  bool _showMap = true;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  final MapController _mapController = MapController();

  // Default center: Semarang
  static const LatLng _semarangCenter = LatLng(-6.9666, 110.4196);

  // Simulated station locations
  final Map<String, LatLng> _stations = {
    'Terminal Terboyo': LatLng(-6.9567, 110.4383),
    'Simpang Lima': LatLng(-6.9900, 110.4200),
    'Terminal Mangkang': LatLng(-6.9300, 110.4000),
    'Pandanaran Mall': LatLng(-6.9750, 110.4220),
    'RSUP Kariadi': LatLng(-6.9900, 110.4050),
  };
  String _selectedStation = 'Terminal Terboyo';

  // ETA data from backend
  Map<String, List<Map<String, dynamic>>> _etaData = {};

  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadVehicles() async {
    final list = await ApiService.getVehicles();
    setState(() {
      vehicles = list.where((v) => v.id.startsWith('BUS')).toList();
      filteredVehicles = List.from(vehicles);
      isLoading = false;
    });
    _loadETA();
  }

  Future<void> _loadETA() async {
    // In production, call GET /transit/eta/:stationId for each station
    // For now, simulate ETA based on distance
    final stationLatLng = _stations[_selectedStation] ?? _semarangCenter;
    final etas = <String, List<Map<String, dynamic>>>{};

    for (final vehicle in vehicles) {
      final distance = _calculateDistance(stationLatLng, LatLng(vehicle.lat, vehicle.lng));
      final etaMinutes = (distance / 300).ceil(); // Rough: 300m per minute
      etas[vehicle.id] = [{'etaMinutes': etaMinutes, 'distance': distance}];
    }

    setState(() => _etaData = etas);
  }

  double _calculateDistance(LatLng a, LatLng b) {
    const R = 6371000; // Earth radius in meters
    final dLat = (b.latitude - a.latitude) * pi / 180;
    final dLon = (b.longitude - a.longitude) * pi / 180;
    final la = a.latitude * pi / 180;
    final lb = b.latitude * pi / 180;
    final h = (dLat / 2) * (dLat / 2) + cos(la) * cos(lb) * (dLon / 2) * (dLon / 2);
    return R * 2 * asin(sqrt(h));
  }

  void _filterVehicles(String query) {
    setState(() {
      _searchQuery = query.toLowerCase();
      if (_searchQuery.isEmpty) {
        filteredVehicles = List.from(vehicles);
      } else {
        filteredVehicles = vehicles.where((v) =>
          v.code.toLowerCase().contains(_searchQuery) ||
          v.name.toLowerCase().contains(_searchQuery) ||
          v.id.toLowerCase().contains(_searchQuery)
        ).toList();
      }
    });
  }

  Color _getVehicleColor(String status) {
    switch (status) {
      case 'emergency': return AppTheme.statusRed;
      case 'warning': return AppTheme.statusAmber;
      case 'normal': return AppTheme.statusGreen;
      default: return AppTheme.textMuted;
    }
  }

  void _showPanicDialog() {
    String selectedBus = filteredVehicles.isNotEmpty ? filteredVehicles.first.id : '';
    String reason = 'Sexual Harassment / Threats';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: AppTheme.statusRed, size: 28),
            SizedBox(width: 8),
            Text('Passenger Panic Alert', style: TextStyle(color: AppTheme.statusRed, fontSize: 18, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Triggering panic will instantly alert VigilOS Command Center and nearby Patrol Units.',
              style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: selectedBus,
              dropdownColor: AppTheme.bgSecondary,
              decoration: const InputDecoration(labelText: 'Select Active Bus', border: OutlineInputBorder()),
              items: filteredVehicles.map((v) => DropdownMenuItem(value: v.id, child: Text('${v.code} (${v.name})'))).toList(),
              onChanged: (val) {
                if (val != null) selectedBus = val;
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: reason,
              dropdownColor: AppTheme.bgSecondary,
              decoration: const InputDecoration(labelText: 'Incident Type', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'Sexual Harassment / Threats', child: Text('Sexual Harassment / Threats')),
                DropdownMenuItem(value: 'Pickpocketing / Theft', child: Text('Pickpocketing / Theft')),
                DropdownMenuItem(value: 'Medical Emergency', child: Text('Medical Emergency')),
                DropdownMenuItem(value: 'Suspicious Activity', child: Text('Suspicious Activity')),
              ],
              onChanged: (val) {
                if (val != null) reason = val;
              },
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.statusRed),
            onPressed: () {
              Navigator.pop(ctx);
              // Navigate to panic status screen with 2-step confirmation
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => PanicStatusScreen(
                    vehicleId: selectedBus,
                    vehicleCode: filteredVehicles.firstWhere((v) => v.id == selectedBus, orElse: () => filteredVehicles.first).code,
                    reason: reason,
                  ),
                ),
              );
            },
            child: const Text('CONTINUE'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Public Transit'),
        actions: [
          IconButton(
            icon: const Icon(Icons.alt_route, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (context) => const RoutePlannerScreen()));
            },
            tooltip: 'Route Planner',
          ),
          IconButton(
            icon: Icon(_showMap ? Icons.list : Icons.map, color: AppTheme.textPrimary),
            onPressed: () => setState(() => _showMap = !_showMap),
            tooltip: _showMap ? 'Show List' : 'Show Map',
          ),
          IconButton(
            icon: const Icon(Icons.person_outline, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (context) => const ProfileScreen()));
            },
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                // Map view
                if (_showMap) _buildMapView(),
                // List view (draggable bottom sheet)
                if (!_showMap) _buildListView(),
                // Search bar overlay
                Positioned(
                  top: 12,
                  left: 12,
                  right: 12,
                  child: _buildSearchBar(),
                ),
                // Station selector
                Positioned(
                  top: 68,
                  left: 12,
                  right: 12,
                  child: _buildStationSelector(),
                ),
              ],
            ),
      // FAB panic button (always visible)
      floatingActionButton: FloatingActionButton(
        onPressed: _showPanicDialog,
        backgroundColor: AppTheme.statusRed,
        elevation: 8,
        child: const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 28),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: TextField(
        controller: _searchController,
        onChanged: _filterVehicles,
        style: const TextStyle(color: AppTheme.textPrimary),
        decoration: InputDecoration(
          hintText: 'Search buses, routes...',
          hintStyle: const TextStyle(color: AppTheme.textMuted),
          prefixIcon: const Icon(Icons.search, color: AppTheme.textMuted),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, color: AppTheme.textMuted),
                  onPressed: () {
                    _searchController.clear();
                    _filterVehicles('');
                  },
                )
              : null,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
    );
  }

  Widget _buildStationSelector() {
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
          const Icon(Icons.location_on, color: AppTheme.accentBlue, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _selectedStation,
                dropdownColor: AppTheme.bgSecondary,
                isExpanded: true,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                items: _stations.keys.map((st) => DropdownMenuItem(value: st, child: Text(st))).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _selectedStation = val);
                    _loadETA();
                    // Move map to station
                    final stationLatLng = _stations[val];
                    if (stationLatLng != null) {
                      _mapController.move(stationLatLng, 14);
                    }
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapView() {
    final stationLatLng = _stations[_selectedStation] ?? _semarangCenter;

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: stationLatLng,
        initialZoom: 14,
        onTap: (tapPosition, point) => {},
      ),
      children: [
        // Dark map tiles
        TileLayer(
          urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          subdomains: const ['a', 'b', 'c'],
          userAgentPackageName: 'com.vigilos.mobile',
        ),
        // Station marker
        MarkerLayer(
          markers: [
            Marker(
              point: stationLatLng,
              width: 40,
              height: 40,
              child: const Icon(Icons.location_on, color: AppTheme.accentBlue, size: 36),
            ),
          ],
        ),
        // Vehicle markers
        MarkerLayer(
          markers: filteredVehicles.map((v) => Marker(
            point: LatLng(v.lat, v.lng),
            width: 36,
            height: 36,
            child: Container(
              decoration: BoxDecoration(
                color: _getVehicleColor(v.status),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(color: _getVehicleColor(v.status).withOpacity(0.5), blurRadius: 6),
                ],
              ),
              child: const Icon(Icons.directions_bus, color: Colors.white, size: 20),
            ),
          )).toList(),
        ),
      ],
    );
  }

  Widget _buildListView() {
    return Column(
      children: [
        const SizedBox(height: 130), // Space for search + station
        // Station info card
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.train, color: AppTheme.accentBlue, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_selectedStation, style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
                    Text('${filteredVehicles.length} buses in range', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Bus list
        Expanded(
          child: filteredVehicles.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: filteredVehicles.length,
                  itemBuilder: (ctx, idx) => _buildBusCard(filteredVehicles[idx]),
                ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.directions_bus_filled, size: 64, color: AppTheme.textMuted.withOpacity(0.5)),
          const SizedBox(height: 16),
          const Text('No buses found', style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('No buses are currently serving this station', style: TextStyle(color: AppTheme.textMuted, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildBusCard(Vehicle bus) {
    final etaInfo = _etaData[bus.id];
    final etaMinutes = etaInfo?.isNotEmpty == true ? etaInfo![0]['etaMinutes'] as int : 99;
    final distance = etaInfo?.isNotEmpty == true ? etaInfo![0]['distance'] as double : 0;

    return Card(
      color: AppTheme.bgCard,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: bus.status == 'emergency' ? AppTheme.statusRed : Colors.transparent,
          width: bus.status == 'emergency' ? 2 : 0,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.all(12),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: _getVehicleColor(bus.status).withOpacity(0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.directions_bus, color: _getVehicleColor(bus.status), size: 24),
        ),
        title: Row(
          children: [
            Text(bus.code, style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: _getVehicleColor(bus.status).withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(bus.status.toUpperCase(), style: TextStyle(fontSize: 10, color: _getVehicleColor(bus.status), fontWeight: FontWeight.bold)),
            ),
          ],
        ),
        subtitle: Text(bus.name, style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              etaMinutes < 99 ? 'ETA: $etaMinutes min' : 'ETA: --',
              style: TextStyle(
                color: etaMinutes <= 5 ? AppTheme.statusGreen : AppTheme.textMuted,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${(distance / 1000).toStringAsFixed(1)} km',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
