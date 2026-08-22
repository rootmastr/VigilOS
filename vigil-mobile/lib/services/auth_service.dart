import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/user.dart';
import '../config/api_config.dart';

// Platform-specific storage
import 'storage_service.dart';

class AuthService {
  static String get baseUrl => ApiConfig.baseUrl;
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
      ).timeout(const Duration(seconds: 15));

      final body = json.decode(response.body);

      if (response.statusCode == 200 && body['success'] == true) {
        _token = body['data']['accessToken'] ?? body['data']['token'];
        _currentUser = User.fromJson(body['data']['user']);
        await _saveToken(_token!);
        await _saveUser(_currentUser!);
        return {'success': true, 'user': _currentUser};
      }

      // Extract actual error from server response
      String errorMsg;
      if (response.statusCode == 429) {
        errorMsg = body['message'] ?? 'Terlalu banyak percobaan login. Coba lagi nanti.';
      } else if (response.statusCode == 403) {
        errorMsg = body['error'] ?? 'Akun tidak aktif.';
      } else if (response.statusCode == 401) {
        errorMsg = body['error'] ?? 'Email atau password salah.';
      } else if (response.statusCode >= 500) {
        errorMsg = 'Server error. Coba lagi nanti.';
      } else {
        errorMsg = body['error'] ?? 'Email atau password salah.';
      }
      return {'success': false, 'error': errorMsg};
    } catch (e) {
      if (e.toString().contains('TimeoutException') || e.toString().contains('timed out')) {
        return {'success': false, 'error': 'Koneksi timeout. Periksa jaringan Anda.'};
      }
      return {'success': false, 'error': 'Gagal terhubung ke server. Periksa koneksi jaringan.'};
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
      ).timeout(const Duration(seconds: 15));

      final body = json.decode(response.body);

      if ((response.statusCode == 201 || response.statusCode == 200) && body['success'] == true) {
        _token = body['data']['accessToken'] ?? body['data']['token'];
        _currentUser = User.fromJson(body['data']['user']);
        await _saveToken(_token!);
        await _saveUser(_currentUser!);
        return {'success': true, 'user': _currentUser};
      }

      String errorMsg;
      if (response.statusCode == 409) {
        errorMsg = body['error'] ?? 'Email sudah terdaftar.';
      } else if (response.statusCode >= 500) {
        errorMsg = 'Server error. Coba lagi nanti.';
      } else {
        errorMsg = body['error'] ?? 'Registrasi gagal.';
      }
      return {'success': false, 'error': errorMsg};
    } catch (e) {
      if (e.toString().contains('TimeoutException') || e.toString().contains('timed out')) {
        return {'success': false, 'error': 'Koneksi timeout. Periksa jaringan Anda.'};
      }
      return {'success': false, 'error': 'Gagal terhubung ke server. Periksa koneksi jaringan.'};
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
