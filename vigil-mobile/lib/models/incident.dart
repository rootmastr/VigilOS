class Incident {
  final String id;
  final String vehicleId;
  final String vehicleCode;
  final String driverName;
  final String type;
  final String severity;
  final double lat;
  final double lng;
  final String status;
  final String timestamp;
  final String details;

  Incident({
    required this.id,
    required this.vehicleId,
    required this.vehicleCode,
    required this.driverName,
    required this.type,
    required this.severity,
    required this.lat,
    required this.lng,
    required this.status,
    required this.timestamp,
    required this.details,
  });

  factory Incident.fromJson(Map<String, dynamic> json) {
    final loc = json['location'] as Map<String, dynamic>?;
    return Incident(
      id: json['id'] ?? '',
      vehicleId: json['vehicleId'] ?? '',
      vehicleCode: json['vehicleCode'] ?? json['vehicleId'] ?? '',
      driverName: json['driverName'] ?? 'Unknown Driver',
      type: json['type'] ?? 'PANIC_BUTTON',
      severity: json['severity'] ?? 'CRITICAL',
      lat: (loc?['lat'] as num?)?.toDouble() ?? -6.9666,
      lng: (loc?['lng'] as num?)?.toDouble() ?? 110.4196,
      status: json['status'] ?? 'ACTIVE',
      timestamp: json['timestamp'] ?? DateTime.now().toIso8601String(),
      details: json['details'] ?? 'Emergency panic alert reported.',
    );
  }
}
