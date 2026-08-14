import 'dart:async';
import 'api_service.dart';
import '../models/incident.dart';

class IncidentService {
  static final IncidentService _instance = IncidentService._internal();
  factory IncidentService() => _instance;
  IncidentService._internal();

  final ApiService _api = ApiService();

  List<Incident> _incidents = [];
  Incident? _selectedIncident;

  Function(List<Incident>)? onIncidentsUpdate;
  Function(Incident)? onIncidentSelected;

  List<Incident> get incidents => List.unmodifiable(_incidents);
  Incident? get selectedIncident => _selectedIncident;

  Future<void> initialize() async {
    await fetchIncidents();
  }

  Future<void> fetchIncidents({
    String? status,
    String? severity,
    String? type,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _api.getIncidents(
        status: status,
        severity: severity,
        type: type,
        page: page,
        limit: limit,
      );
      _incidents = response;
      onIncidentsUpdate?.call(_incidents);
    } catch (e) {
      print('Failed to fetch incidents: $e');
    }
  }

  void selectIncident(Incident? incident) {
    _selectedIncident = incident;
    onIncidentSelected?.call(incident);
  }

  Incident? getIncidentById(String id) {
    try {
      return _incidents.firstWhere((i) => i.id == id);
    } catch (e) {
      return null;
    }
  }

  List<Incident> getOpenIncidents() {
    return _incidents.where((i) => i.status == 'OPEN').toList();
  }

  List<Incident> getCriticalIncidents() {
    return _incidents.where((i) => i.severity == 'CRITICAL').toList();
  }

  List<Incident> searchIncidents(String query) {
    final lowercaseQuery = query.toLowerCase();
    return _incidents.where((i) {
      return (i.description?.toLowerCase().contains(lowercaseQuery) ?? false) ||
             (i.vehicle?.code.toLowerCase().contains(lowercaseQuery) ?? false) ||
             (i.vehicle?.name.toLowerCase().contains(lowercaseQuery) ?? false);
    }).toList();
  }

  Future<void> createIncident(Incident incident) async {
    try {
      await _api.createIncident(incident);
      await fetchIncidents();
    } catch (e) {
      print('Failed to create incident: $e');
      rethrow;
    }
  }

  Future<void> updateIncidentStatus(String incidentId, String status) async {
    try {
      await _api.updateIncidentStatus(incidentId, status);
      await fetchIncidents();
    } catch (e) {
      print('Failed to update incident: $e');
      rethrow;
    }
  }

  void dispose() {
    // Cleanup if needed
  }
}
