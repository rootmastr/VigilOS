class AppConstants {
  // API
  static const String apiBaseUrl = 'http://localhost:3000/api/v1';
  static const String wsUrl = 'ws://localhost:3000/ws';
  static const Duration apiTimeout = Duration(seconds: 30);

  // Storage Keys
  static const String tokenKey = 'vigil_auth_token';
  static const String refreshTokenKey = 'vigil_refresh_token';
  static const String userKey = 'vigil_user';
  static const String settingsKey = 'vigil_settings';

  // Default Coordinates (Semarang)
  static const double defaultLatitude = -6.9666;
  static const double defaultLongitude = 110.4196;
  static const double defaultZoom = 13.0;

  // Map Settings
  static const double markerSize = 40.0;
  static const double clusterRadius = 100.0;
  static const Duration locationUpdateInterval = Duration(seconds: 5);

  // Pagination
  static const int defaultPageSize = 20;
  static const int maxPageSize = 100;

  // Timeouts
  static const Duration locationTimeout = Duration(seconds: 10);
  static const Duration uploadTimeout = Duration(minutes: 5);
  static const Duration syncTimeout = Duration(seconds: 30);

  // Limits
  static const int maxPhotos = 5;
  static const int maxPhotoSizeMB = 10;
  static const int maxAudioLengthSeconds = 60;
  static const int maxDescriptionLength = 500;

  // Cache
  static const Duration cacheExpiry = Duration(hours: 1);
  static const int maxCacheSize = 50 * 1024 * 1024; // 50MB

  // Notification
  static const String notificationChannelId = 'vigilos_channel';
  static const String notificationChannelName = 'VigilOS Notifications';
  static const String notificationChannelDescription = 'Notifications for VigilOS alerts and updates';

  // Vehicle Types
  static const List<String> vehicleTypes = [
    'BUS',
    'MINIBUS',
    'MICROBUS',
    'SHUTTLE',
    'PATROL',
    'OTHER',
  ];

  // Vehicle Status
  static const List<String> vehicleStatuses = [
    'ACTIVE',
    'INACTIVE',
    'MAINTENANCE',
    'OFFLINE',
  ];

  // Incident Types
  static const List<String> incidentTypes = [
    'PANIC_BUTTON',
    'SPEED_VIOLATION',
    'GEOFENCE_BREACH',
    'HARSH_BRAKING',
    'COLLISION',
    'THEFT_ATTEMPT',
    'MECHANICAL_FAILURE',
    'ROUTE_DEVIATION',
    'OTHER',
  ];

  // Incident Severity
  static const List<String> incidentSeverities = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ];

  // Incident Status
  static const List<String> incidentStatuses = [
    'OPEN',
    'INVESTIGATING',
    'ESCALATED',
    'RESOLVED',
    'CLOSED',
  ];

  // Report Types
  static const List<String> reportTypes = [
    'ROUTE_COMPLIANCE',
    'VEHICLE_CONDITION',
    'INCIDENT_WITNESS',
    'WEATHER_CONDITION',
    'ROAD_CONDITION',
    'PASSENGER_COMPLAINT',
    'OTHER',
  ];

  // User Roles
  static const List<String> userRoles = [
    'ADMIN',
    'DISPATCHER',
    'OFFICER',
    'VIEWER',
  ];
}

class ApiEndpoints {
  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refreshToken = '/auth/refresh';

  static const String vehicles = '/vehicles';
  static String vehicle(String id) => '/vehicles/$id';
  static String vehicleLocation(String id) => '/vehicles/$id/location';
  static String vehicleSpeed(String id) => '/vehicles/$id/speed';

  static const String incidents = '/incidents';
  static String incident(String id) => '/incidents/$id';
  static String incidentTimeline(String id) => '/incidents/$id/timeline';
  static const String incidentExport = '/incidents/export/csv';

  static const String fieldReports = '/field-reports';
  static String fieldReport(String id) => '/field-reports/$id';
  static const String fieldReportSync = '/field-reports/sync';

  static const String analytics = '/analytics';
  static const String dashboard = '/analytics/dashboard';
  static String speedHistory(String vehicleId) => '/analytics/speed-history/$vehicleId';
  static String incidentTimelineAnalytics(String vehicleId) => '/analytics/incidents/timeline/$vehicleId';

  static const String emergency = '/emergency';
  static const String panic = '/emergency/panic';
  static const String queue = '/emergency/queue';

  static const String route = '/route';
  static const String eta = '/route/eta';
  static const String optimize = '/route/optimize';

  static const String billing = '/billing';
  static const String subscription = '/billing/subscription';
  static String invoicePdf(String id) => '/billing/invoice/$id/pdf';

  static const String stations = '/stations';
  static const String corridors = '/corridors';
}

class VehicleStatusColors {
  static const Map<String, int> colors = {
    'ACTIVE': 0xFF4CAF50,
    'INACTIVE': 0xFF9E9E9E,
    'MAINTENANCE': 0xFFFF9800,
    'OFFLINE': 0xFFF44336,
  };
}

class IncidentSeverityColors {
  static const Map<String, int> colors = {
    'LOW': 0xFF2196F3,
    'MEDIUM': 0xFFFFEB3B,
    'HIGH': 0xFFFF9800,
    'CRITICAL': 0xFFF44336,
  };
}

class IncidentStatusIcons {
  static const Map<String, String> icons = {
    'OPEN': '🔴',
    'INVESTIGATING': '🟡',
    'ESCALATED': '🟠',
    'RESOLVED': '🟢',
    'CLOSED': '⚫',
  };
}
