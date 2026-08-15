import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/user.dart';

// Platform-specific storage
import 'storage_service.dart';

class AuthService {
  static const String baseUrl = 'http://111.68.31.232:4141/api/v1';
  static final StorageService _storage = StorageService();

  static String? _token;
  static User? _currentUser;

  static User? get currentUser => _currentUser;
  static bool get isLoggedIn => _token != null && _currentUser != null;
  static String? get token => _token;

  // Login
  static Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email, 'password': password}),
      );

      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        if (body['success'] == true) {
          _token = body['data']['accessToken'] ?? body['data']['token'];
          _currentUser = User.fromJson(body['data']['user']);
          await _saveToken(_token!);
          await _saveUser(_currentUser!);
          return {'success': true, 'user': _currentUser};
        }
      }
      return {'success': false, 'error': 'Invalid email or password'};
    } catch (e) {
      return {'success': false, 'error': 'Connection failed: $e'};
    }
  }

  // Register
  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
    String role = 'PUBLIC_USER',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': name,
          'email': email,
          'password': password,
          'role': role,
        }),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = json.decode(response.body);
        if (body['success'] == true) {
          _token = body['data']['accessToken'] ?? body['data']['token'];
          _currentUser = User.fromJson(body['data']['user']);
          await _saveToken(_token!);
          await _saveUser(_currentUser!);
          return {'success': true, 'user': _currentUser};
        }
      }
      return {'success': false, 'error': 'Registration failed'};
    } catch (e) {
      return {'success': false, 'error': 'Connection failed: $e'};
    }
  }

  // Logout
  static Future<void> logout() async {
    _token = null;
    _currentUser = null;
    await _storage.delete('auth_token');
    await _storage.delete('user_data');
  }

  // Check if user is already logged in
  static Future<bool> tryAutoLogin() async {
    final token = await _storage.read('auth_token');
    final userData = await _storage.read('user_data');

    if (token != null && userData != null) {
      _token = token;
      _currentUser = User.fromJson(json.decode(userData));
      return true;
    }
    return false;
  }

  // Save token to storage
  static Future<void> _saveToken(String token) async {
    await _storage.write('auth_token', token);
  }

  // Save user data to storage
  static Future<void> _saveUser(User user) async {
    await _storage.write('user_data', json.encode(user.toJson()));
  }

  // Get stored token
  static Future<String?> getStoredToken() async {
    return await _storage.read('auth_token');
  }
}
