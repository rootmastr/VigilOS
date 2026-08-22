import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/vehicle.dart';
import '../models/incident.dart';
import '../models/officer.dart';
import 'auth_service.dart';

class WebSocketService {
  static const String serverUrl = 'http://111.68.31.232:4141';
  IO.Socket? socket;

  Function(List<Vehicle>)? onVehiclesUpdate;
  Function(Vehicle)? onVehicleUpdated;
  Function(List<Officer>)? onOfficersUpdate;
  Function(Incident)? onEmergencyAlert;
  Function(Officer)? onOfficerStatusChanged;
  Function(bool)? onConnectionChanged;

  bool _isConnected = false;
  bool get isConnected => _isConnected;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;

  void connect() {
    final token = AuthService.token;
    socket = IO.io(serverUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'autoConnect': true,
      'reconnection': true,
      'reconnectionAttempts': _maxReconnectAttempts,
      'reconnectionDelay': 1000,
      'reconnectionDelayMax': 5000,
      'timeout': 10000,
      'auth': {
        'token': token,
      },
    });

    socket?.onConnect((_) {
      print('[Flutter WebSocket] Connected to VigilOS Backend');
      _isConnected = true;
      _reconnectAttempts = 0;
      onConnectionChanged?.call(true);
    });

    socket?.onDisconnect((_) {
      print('[Flutter WebSocket] Disconnected from server');
      _isConnected = false;
      onConnectionChanged?.call(false);
    });

    socket?.onReconnect((_) {
      print('[Flutter WebSocket] Reconnected');
      _isConnected = true;
      _reconnectAttempts = 0;
      onConnectionChanged?.call(true);
    });

    socket?.onReconnectAttempt((attempt) {
      _reconnectAttempts = attempt;
      print('[Flutter WebSocket] Reconnect attempt $attempt/$_maxReconnectAttempts');
    });

    socket?.onReconnectError((_) {
      print('[Flutter WebSocket] Reconnect error');
    });

    socket?.onReconnectFailed((_) {
      print('[Flutter WebSocket] Reconnect failed after $_maxReconnectAttempts attempts');
    });

    socket?.on('initial_state', (data) {
      if (data is Map) {
        if (data['vehicles'] is List) {
          final list = (data['vehicles'] as List).map((json) => Vehicle.fromJson(json)).toList();
          onVehiclesUpdate?.call(list);
        }
        if (data['officers'] is List) {
          final list = (data['officers'] as List).map((json) => Officer.fromJson(json)).toList();
          onOfficersUpdate?.call(list);
        }
      }
    });

    socket?.on('telemetry_update', (data) {
      if (data is Map) {
        final vehicleId = data['vehicleId'];
        if (vehicleId != null) {
          final vehicle = Vehicle.fromJson(Map<String, dynamic>.from(data));
          onVehicleUpdated?.call(vehicle);
        }
      }
    });

    socket?.on('vehicle_status_changed', (data) {
      if (data is Map) {
        final vehicle = Vehicle.fromJson(Map<String, dynamic>.from(data));
        onVehicleUpdated?.call(vehicle);
      }
    });

    socket?.on('emergency_alert', (data) {
      if (data is Map && data['incident'] != null) {
        final incident = Incident.fromJson(data['incident']);
        onEmergencyAlert?.call(incident);
      }
    });

    socket?.on('officer_status_changed', (data) {
      if (data is Map) {
        final officer = Officer.fromJson(Map<String, dynamic>.from(data));
        onOfficerStatusChanged?.call(officer);
      }
    });
  }

  void updateOfficerStatus(String officerId, String dutyStatus) {
    socket?.emit('update_officer_status', {
      'officerId': officerId,
      'dutyStatus': dutyStatus,
    });
  }

  void disconnect() {
    socket?.disconnect();
    socket?.dispose();
    _isConnected = false;
  }
}
