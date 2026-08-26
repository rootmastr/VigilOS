class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final String tenantId;
  final String? officerId;
  final String? avatar;

  User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.tenantId,
    this.officerId,
    this.avatar,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      role: json['role'] ?? 'PUBLIC_USER',
      tenantId: json['tenantId'] ?? '',
      officerId: json['officerId'],
      avatar: json['avatar'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'role': role,
      'tenantId': tenantId,
      'officerId': officerId,
      'avatar': avatar,
    };
  }

  bool get isPublicUser => role == 'PUBLIC_USER';
  bool get isOfficer => role == 'PATROL_OFFICER';
  bool get isAdmin => role == 'SUPER_ADMIN' || role == 'COMMAND_CENTER_OPERATOR';
}
