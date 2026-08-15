import 'dart:async';
import 'api_service.dart';
import '../models/incident.dart';

class IncidentService {
  static final IncidentService _instance = IncidentService._internal();
  factory IncidentService() => _instance;
  IncidentService._internal();

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
      _incidents = await ApiService.getIncidents(
        status: status,
        severity: severity,
        type: type,
        page: page,
        limit: limit,
      );
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
      return (i.details.toLowerCase().contains(lowercaseQuery)) ||
             (i.vehicleCode.toLowerCase().contains(lowercaseQuery)) ||
             (i.driverName.toLowerCase().contains(lowercaseQuery));
    }).toList();
  }

  Future<void> createIncident(Incident incident) async {
    try {
      await ApiService.createIncident(incident);
      await fetchIncidents();
    } catch (e) {
      print('Failed to create incident: $e');
      rethrow;
    }
  }

  Future<void> updateIncidentStatus(String incidentId, String status) async {
    try {
      await ApiService.updateIncidentStatus(incidentId, status);
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
