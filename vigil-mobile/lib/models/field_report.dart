class FieldReport {
  final String localId;
  final String vehicleId;
  final String type;
  final double lat;
  final double lng;
  final String description;
  final List<String> photos;
  final String? audio;
  final String status;
  final DateTime createdAt;

  FieldReport({
    required this.localId,
    required this.vehicleId,
    required this.type,
    required this.lat,
    required this.lng,
    required this.description,
    this.photos = const [],
    this.audio,
    this.status = 'PENDING',
    required this.createdAt,
  });

  factory FieldReport.fromJson(Map<String, dynamic> json) {
    return FieldReport(
      localId: json['localId'] ?? '',
      vehicleId: json['vehicleId'] ?? '',
      type: json['type'] ?? 'OTHER',
      lat: (json['lat'] as num?)?.toDouble() ?? 0.0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0.0,
      description: json['description'] ?? '',
      photos: List<String>.from(json['photos'] ?? []),
      audio: json['audio'],
      status: json['status'] ?? 'PENDING',
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'localId': localId,
      'vehicleId': vehicleId,
      'type': type,
      'lat': lat,
      'lng': lng,
      'description': description,
      'photos': photos,
      'audio': audio,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
    };
  }
}
