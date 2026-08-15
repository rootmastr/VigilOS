import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/vehicle.dart';
import '../models/incident.dart';
import '../models/officer.dart';
import 'auth_service.dart';

class WebSocketService {
  static const String serverUrl = 'http://111.68.31.232:4141';
  IO.Socket? socket;

  Function(List<Vehicle>)? onVehiclesUpdate;
  Function(List<Officer>)? onOfficersUpdate;
  Function(Incident)? onEmergencyAlert;
  Function(Officer)? onOfficerStatusChanged;

  void connect() {
    final token = AuthService.token;
    socket = IO.io(serverUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'autoConnect': true,
      'auth': {
        'token': token,
      },
    });

    socket?.onConnect((_) {
      print('[Flutter WebSocket] Connected to VigilOS Backend');
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
      // Telemetry update received
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

    socket?.onDisconnect((_) {
      print('[Flutter WebSocket] Disconnected from server');
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
  }
}
