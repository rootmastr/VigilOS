import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/field_report.dart';
import 'api_service.dart';

class OfflineService {
  static final OfflineService _instance = OfflineService._internal();
  factory OfflineService() => _instance;
  OfflineService._internal();

  final _connectivity = Connectivity();
  StreamSubscription<ConnectivityResult>? _connectivitySubscription;
  
  List<FieldReport> _pendingReports = [];
  Map<String, dynamic> _cachedData = {};
  bool _isOnline = true;
  
  Function(bool)? onConnectivityChange;
  Function()? onSyncComplete;

  bool get isOnline => _isOnline;
  List<FieldReport> get pendingReports => List.unmodifiable(_pendingReports);

  Future<void> initialize() async {
    // Check initial connectivity
    await _checkConnectivity();

    // Load pending reports from storage
    await _loadPendingReports();

    // Listen for connectivity changes
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
      (result) async {
        final wasOnline = _isOnline;
        _isOnline = result != ConnectivityResult.none;
        
        if (wasOnline != _isOnline) {
          onConnectivityChange?.call(_isOnline);
          
          // Auto-sync when coming online
          if (_isOnline && _pendingReports.isNotEmpty) {
            await syncPendingReports();
          }
        }
      },
    );
  }

  Future<void> _checkConnectivity() async {
    final result = await _connectivity.checkConnectivity();
    _isOnline = result != ConnectivityResult.none;
  }

  Future<void> _loadPendingReports() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final reportsJson = prefs.getStringList('pending_reports') ?? [];
      
      _pendingReports = reportsJson.map((json) {
        return FieldReport.fromJson(jsonDecode(json));
      }).toList();
      
      print('Loaded ${_pendingReports.length} pending reports');
    } catch (e) {
      print('Failed to load pending reports: $e');
    }
  }

  Future<void> _savePendingReports() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final reportsJson = _pendingReports.map((report) {
        return jsonEncode(report.toJson());
      }).toList();
      
      await prefs.setStringList('pending_reports', reportsJson);
    } catch (e) {
      print('Failed to save pending reports: $e');
    }
  }

  Future<void> saveReportOffline(FieldReport report) async {
    _pendingReports.add(report);
    await _savePendingReports();
    print('Report saved offline: ${report.localId}');
  }

  Future<void> syncPendingReports() async {
    if (_pendingReports.isEmpty || !_isOnline) return;

    print('Syncing ${_pendingReports.length} pending reports...');
    
    final api = ApiService();
    List<FieldReport> failedReports = [];

    for (final report in _pendingReports) {
      try {
        await api.syncFieldReport(report);
        print('Synced report: ${report.localId}');
      } catch (e) {
        print('Failed to sync report ${report.localId}: $e');
        failedReports.add(report);
      }
    }

    _pendingReports = failedReports;
    await _savePendingReports();

    if (_pendingReports.isEmpty) {
      print('All reports synced successfully');
      onSyncComplete?.call();
    } else {
      print('${_pendingReports.length} reports still pending');
    }
  }

  Future<void> cacheData(String key, dynamic data) async {
    _cachedData[key] = {
      'data': data,
      'timestamp': DateTime.now().toIso8601String(),
    };
    
    await _saveCache();
  }

  T? getCachedData<T>(String key, {Duration maxAge = const Duration(hours: 1)}) {
    final cached = _cachedData[key];
    if (cached == null) return null;

    final timestamp = DateTime.parse(cached['timestamp']);
    if (DateTime.now().difference(timestamp) > maxAge) {
      _cachedData.remove(key);
      return null;
    }

    return cached['data'] as T;
  }

  Future<void> _saveCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('cached_data', jsonEncode(_cachedData));
    } catch (e) {
      print('Failed to save cache: $e');
    }
  }

  Future<void> _loadCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheJson = prefs.getString('cached_data');
      if (cacheJson != null) {
        _cachedData = jsonDecode(cacheJson);
      }
    } catch (e) {
      print('Failed to load cache: $e');
    }
  }

  Future<void> clearCache() async {
    _cachedData.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('cached_data');
  }

  Future<void> clearPendingReports() async {
    _pendingReports.clear();
    await _savePendingReports();
  }

  Map<String, dynamic> getSyncStatus() {
    return {
      'isOnline': _isOnline,
      'pendingReports': _pendingReports.length,
      'cachedItems': _cachedData.length,
    };
  }

  void dispose() {
    _connectivitySubscription?.cancel();
  }
}

// Extension for FieldReport
extension FieldReportOffline on FieldReport {
  Map<String, dynamic> toOfflineJson() {
    return {
      'localId': localId,
      'vehicleId': vehicleId,
      'type': type,
      'lat': lat,
      'lng': lng,
      'description': description,
      'photos': photos,
      'audio': audio,
      'status': 'PENDING',
      'createdAt': createdAt.toIso8601String(),
    };
  }

  static FieldReport fromOfflineJson(Map<String, dynamic> json) {
    return FieldReport(
      localId: json['localId'],
      vehicleId: json['vehicleId'],
      type: json['type'],
      lat: json['lat'],
      lng: json['lng'],
      description: json['description'],
      photos: List<String>.from(json['photos'] ?? []),
      audio: json['audio'],
      status: json['status'] ?? 'PENDING',
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}
