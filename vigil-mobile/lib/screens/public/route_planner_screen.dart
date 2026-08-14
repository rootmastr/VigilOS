import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../profile_screen.dart';

class RoutePlannerScreen extends StatefulWidget {
  const RoutePlannerScreen({Key? key}) : super(key: key);

  @override
  State<RoutePlannerScreen> createState() => _RoutePlannerScreenState();
}

class _RoutePlannerScreenState extends State<RoutePlannerScreen> {
  final TextEditingController _fromController = TextEditingController();
  final TextEditingController _toController = TextEditingController();
  final MapController _mapController = MapController();
  List<Map<String, dynamic>> _routeResults = [];
  bool _isSearching = false;
  bool _hasSearched = false;

  // Predefined locations
  final Map<String, LatLng> _locations = {
    'Terminal Terboyo': LatLng(-6.9567, 110.4383),
    'Simpang Lima': LatLng(-6.9900, 110.4200),
    'Terminal Mangkang': LatLng(-6.9300, 110.4000),
    'Pandanaran Mall': LatLng(-6.9750, 110.4220),
    'RSUP Kariadi': LatLng(-6.9900, 110.4050),
    'Kota Lama': LatLng(-6.9650, 110.4300),
    'Stasiun Tawang': LatLng(-6.9600, 110.4350),
    'Unnes': LatLng(-7.0500, 110.4000),
    'Pelabuhan Tanjung Emas': LatLng(-6.9300, 110.4400),
    'Candi Baru': LatLng(-6.9800, 110.4100),
  };

  // Recent searches
  List<String> _recentSearches = [];

  @override
  void initState() {
    super.initState();
    _loadRecentSearches();
  }

  @override
  void dispose() {
    _fromController.dispose();
    _toController.dispose();
    super.dispose();
  }

  void _loadRecentSearches() {
    // In production, load from SharedPreferences
    _recentSearches = ['Terminal Terboyo → Simpang Lima', 'Terminal Mangkang → Kota Lama'];
  }

  Future<void> _searchRoutes() async {
    if (_fromController.text.isEmpty || _toController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter both origin and destination')),
      );
      return;
    }

    setState(() => _isSearching = true);

    // Simulate API call to GET /transit/routes?from=&to=
    await Future.delayed(const Duration(milliseconds: 800));

    // Mock route results
    final fromLoc = _locations[_fromController.text] ?? LatLng(-6.9666, 110.4196);
    final toLoc = _locations[_toController.text] ?? LatLng(-6.9666, 110.4196);

    setState(() {
      _routeResults = [
        {
          'routeId': 'RT-001',
          'name': 'Koridor 1 — Langsung',
          'duration': 25,
          'distance': 8500,
          'stops': 6,
          'transfers': 0,
          'fare': 3500,
          'via': ['Terminal Terboyo', 'Simpang Lima', 'Kota Lama'],
        },
        {
          'routeId': 'RT-002',
          'name': 'Koridor 9 + Feeder',
          'duration': 35,
          'distance': 12000,
          'stops': 9,
          'transfers': 1,
          'fare': 4000,
          'via': ['Terminal Terboyo', 'Simpang Lima', 'Pandanaran Mall', 'Kota Lama'],
        },
        {
          'routeId': 'RT-003',
          'name': 'Express via Tol Dalam Kota',
          'duration': 18,
          'distance': 7200,
          'stops': 3,
          'transfers': 0,
          'fare': 5500,
          'via': ['Terminal Terboyo', 'Kota Lama (Express)'],
        },
      ];
      _isSearching = false;
      _hasSearched = true;
    });

    // Save to recent searches
    final search = '${_fromController.text} → ${_toController.text}';
    if (!_recentSearches.contains(search)) {
      _recentSearches.insert(0, search);
      if (_recentSearches.length > 5) _recentSearches.removeLast();
    }
  }

  void _swapLocations() {
    final temp = _fromController.text;
    setState(() {
      _fromController.text = _toController.text;
      _toController.text = temp;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Route Planner'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (context) => const ProfileScreen()));
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Search form
          Container(
            padding: const EdgeInsets.all(16),
            color: AppTheme.bgSecondary,
            child: Column(
              children: [
                // From field
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _fromController,
                        decoration: InputDecoration(
                          hintText: 'From (origin)',
                          prefixIcon: const Icon(Icons.circle_outlined, color: AppTheme.statusGreen, size: 20),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: AppTheme.bgCard,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.swap_vert, color: AppTheme.accentBlue),
                      onPressed: _swapLocations,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // To field
                TextField(
                  controller: _toController,
                  decoration: InputDecoration(
                    hintText: 'To (destination)',
                    prefixIcon: const Icon(Icons.location_on, color: AppTheme.statusRed, size: 20),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    filled: true,
                    fillColor: AppTheme.bgCard,
                  ),
                ),
                const SizedBox(height: 12),
                // Search button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _isSearching ? null : _searchRoutes,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentBlue,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: _isSearching
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.search, color: Colors.white),
                    label: Text(_isSearching ? 'Searching...' : 'Find Routes', style: const TextStyle(color: Colors.white)),
                  ),
                ),
                // Recent searches
                if (_recentSearches.isNotEmpty && !_hasSearched) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Recent', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  ),
                  const SizedBox(height: 4),
                  ...(_recentSearches.map((s) => ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.history, color: AppTheme.textMuted, size: 20),
                        title: Text(s, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                        onTap: () {
                          final parts = s.split(' → ');
                          if (parts.length == 2) {
                            _fromController.text = parts[0];
                            _toController.text = parts[1];
                            _searchRoutes();
                          }
                        },
                      ))),
                ],
              ],
            ),
          ),
          // Results
          Expanded(
            child: _hasSearched
                ? _routeResults.isEmpty
                    ? const Center(child: Text('No routes found', style: TextStyle(color: AppTheme.textMuted)))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _routeResults.length,
                        itemBuilder: (ctx, idx) => _buildRouteCard(_routeResults[idx]),
                      )
                : Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.alt_route, size: 64, color: AppTheme.textMuted.withOpacity(0.3)),
                        const SizedBox(height: 16),
                        const Text('Plan your journey', style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        const Text('Enter origin and destination to find routes', style: TextStyle(color: AppTheme.textMuted)),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteCard(Map<String, dynamic> route) {
    final isRecommended = route['routeId'] == 'RT-001';

    return Card(
      color: AppTheme.bgCard,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isRecommended ? AppTheme.statusGreen : Colors.transparent,
          width: isRecommended ? 2 : 0,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(route['name'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textPrimary)),
                ),
                if (isRecommended)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: AppTheme.statusGreen, borderRadius: BorderRadius.circular(4)),
                    child: const Text('RECOMMENDED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildRouteMetric(Icons.access_time, '${route['duration']} min', AppTheme.accentBlue),
                const SizedBox(width: 16),
                _buildRouteMetric(Icons.straighten, '${(route['distance'] / 1000).toStringAsFixed(1)} km', AppTheme.textMuted),
                const SizedBox(width: 16),
                _buildRouteMetric(Icons.train, '${route['stops']} stops', AppTheme.textMuted),
                const SizedBox(width: 16),
                _buildRouteMetric(Icons.swap_horiz, '${route['transfers']} transfer', AppTheme.textMuted),
              ],
            ),
            const SizedBox(height: 12),
            // Route path visualization
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: AppTheme.bgSecondary, borderRadius: BorderRadius.circular(8)),
              child: Row(
                children: [
                  for (var i = 0; i < (route['via'] as List).length; i++) ...[
                    Text(route['via'][i], style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
                    if (i < (route['via'] as List).length - 1)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 4),
                        child: Icon(Icons.arrow_forward, size: 12, color: AppTheme.textMuted),
                      ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Rp ${route['fare']}', style: const TextStyle(color: AppTheme.statusGreen, fontWeight: FontWeight.bold, fontSize: 16)),
                const Spacer(),
                ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Navigating via ${route['name']}')),
                    );
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentBlue),
                  child: const Text('Navigate', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouteMetric(IconData icon, String text, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}
