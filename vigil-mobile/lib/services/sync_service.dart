import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/field_report.dart';
import 'api_service.dart';

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

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
    await _checkConnectivity();
    await _loadPendingReports();
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
      (result) async {
        final wasOnline = _isOnline;
        _isOnline = result != ConnectivityResult.none;

        if (wasOnline != _isOnline) {
          onConnectivityChange?.call(_isOnline);

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
  }

  Future<void> syncPendingReports() async {
    if (_pendingReports.isEmpty || !_isOnline) return;

    List<FieldReport> failedReports = [];

    for (final report in _pendingReports) {
      try {
        await ApiService.syncFieldReport(report);
      } catch (e) {
        failedReports.add(report);
      }
    }

    _pendingReports = failedReports;
    await _savePendingReports();

    if (_pendingReports.isEmpty) {
      onSyncComplete?.call();
    }
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
