class Vehicle {
  final String id;
  final String code;
  final String name;
  final String type;
  final String driver;
  final double speed;
  final double speedLimit;
  final double lat;
  final double lng;
  final String status;
  final int passengers;

  Vehicle({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    required this.driver,
    required this.speed,
    required this.speedLimit,
    required this.lat,
    required this.lng,
    required this.status,
    required this.passengers,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      id: json['id'] ?? '',
      code: json['code'] ?? json['id'] ?? '',
      name: json['name'] ?? 'Transit Unit',
      type: json['type'] ?? 'City Bus',
      driver: json['driver'] ?? 'Unassigned',
      speed: (json['speed'] as num?)?.toDouble() ?? 0.0,
      speedLimit: (json['speedLimit'] as num?)?.toDouble() ?? 50.0,
      lat: (json['lat'] as num?)?.toDouble() ?? -6.9666,
      lng: (json['lng'] as num?)?.toDouble() ?? 110.4196,
      status: json['status'] ?? 'normal',
      passengers: (json['passengers'] as num?)?.toInt() ?? 0,
    );
  }
}
