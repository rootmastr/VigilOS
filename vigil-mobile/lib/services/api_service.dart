import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/officer.dart';
import '../models/vehicle.dart';
import '../models/incident.dart';
import 'auth_service.dart';

class ApiService {
  static const String baseUrl = 'http://localhost:4000/api/v1';

  // Get headers with JWT token
  static Map<String, String> _getHeaders() {
    final token = AuthService.token;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<List<Vehicle>> getVehicles() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/vehicles'),
        headers: _getHeaders(),
      );
      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        final List data = body['data'] ?? [];
        return data.map((json) => Vehicle.fromJson(json)).toList();
      }
    } catch (e) {
      print('Error fetching vehicles: $e');
    }
    return [];
  }

  static Future<List<Incident>> getIncidents() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/incidents'),
        headers: _getHeaders(),
      );
      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        final List data = body['data'] ?? [];
        return data.map((json) => Incident.fromJson(json)).toList();
      }
    } catch (e) {
      print('Error fetching incidents: $e');
    }
    return [];
  }

  static Future<List<Officer>> getOfficers() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/patrol/officers'),
        headers: _getHeaders(),
      );
      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        final List data = body['data'] ?? [];
        return data.map((json) => Officer.fromJson(json)).toList();
      }
    } catch (e) {
      print('Error fetching officers: $e');
    }
    return [];
  }

  static Future<bool> updateOfficerStatus(String id, String status) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/patrol/officers/$id/status'),
        headers: _getHeaders(),
        body: json.encode({'dutyStatus': status}),
      );
      return response.statusCode == 200;
    } catch (e) {
      print('Error updating officer status: $e');
    }
    return false;
  }

  static Future<bool> triggerEmergency(String vehicleId, String details) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/emergency/trigger'),
        headers: _getHeaders(),
        body: json.encode({'vehicleId': vehicleId, 'details': details}),
      );
      return response.statusCode == 200;
    } catch (e) {
      print('Error triggering emergency: $e');
    }
    return false;
  }

  static Future<bool> resolveIncident(String incidentId, String notes, String photoUrl) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/incidents/$incidentId/resolve'),
        headers: _getHeaders(),
        body: json.encode({
          'operatorId': AuthService.currentUser?.id ?? 'Officer Mobile App',
          'fieldReport': {
            'officerId': AuthService.currentUser?.officerId ?? 'OFF-101',
            'notes': notes,
            'photoUrl': photoUrl,
          }
        }),
      );
      return response.statusCode == 200;
    } catch (e) {
      print('Error resolving incident: $e');
    }
    return false;
  }
}
