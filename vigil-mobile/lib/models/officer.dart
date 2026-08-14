class Officer {
  final String id;
  final String name;
  final String badgeNo;
  final String dutyStatus;
  final String unitId;
  final String phone;

  Officer({
    required this.id,
    required this.name,
    required this.badgeNo,
    required this.dutyStatus,
    required this.unitId,
    required this.phone,
  });

  factory Officer.fromJson(Map<String, dynamic> json) {
    return Officer(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      badgeNo: json['badgeNo'] ?? '',
      dutyStatus: json['dutyStatus'] ?? 'Available',
      unitId: json['unitId'] ?? '',
      phone: json['phone'] ?? '',
    );
  }

  Officer copyWith({String? dutyStatus}) {
    return Officer(
      id: id,
      name: name,
      badgeNo: badgeNo,
      dutyStatus: dutyStatus ?? this.dutyStatus,
      unitId: unitId,
      phone: phone,
    );
  }
}
