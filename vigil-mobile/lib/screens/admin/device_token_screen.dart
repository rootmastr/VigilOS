import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';

class DeviceTokenScreen extends StatefulWidget {
  const DeviceTokenScreen({Key? key}) : super(key: key);

  @override
  State<DeviceTokenScreen> createState() => _DeviceTokenScreenState();
}

class _DeviceTokenScreenState extends State<DeviceTokenScreen> {
  List<dynamic> _tokens = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadTokens();
  }

  Map<String, String> _headers() {
    final token = AuthService.token;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<void> _loadTokens() async {
    try {
      final response = await http.get(
        Uri.parse('${ApiService.baseUrl}/tokens'),
        headers: _headers(),
      );
      if (mounted && response.statusCode == 200) {
        final body = json.decode(response.body);
        setState(() {
          _tokens = body['data'] ?? [];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _generateToken() async {
    final deviceIdController = TextEditingController();
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Generate Device Token'),
        content: TextField(
          controller: deviceIdController,
          decoration: const InputDecoration(
            labelText: 'Device ID',
            hintText: 'e.g. ESP-TRACKER-001',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, {'deviceId': deviceIdController.text}),
            child: const Text('Generate'),
          ),
        ],
      ),
    );

    if (result != null && result['deviceId']!.isNotEmpty) {
      try {
        final response = await http.post(
          Uri.parse('${ApiService.baseUrl}/tokens/generate'),
          headers: _headers(),
          body: json.encode({'deviceId': result['deviceId']}),
        );
        if (response.statusCode == 201) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Token generated successfully')),
          );
          _loadTokens();
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _revokeToken(String tokenId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Revoke Token'),
        content: const Text('Are you sure you want to revoke this token? The device will lose access.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Revoke', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await http.post(
          Uri.parse('${ApiService.baseUrl}/tokens/$tokenId/revoke'),
          headers: _headers(),
        );
        _loadTokens();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Device Tokens'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _generateToken,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _tokens.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.token, size: 64, color: AppTheme.textMuted),
                      SizedBox(height: 16),
                      Text('No device tokens', style: TextStyle(color: AppTheme.textMuted, fontSize: 16)),
                      SizedBox(height: 8),
                      Text('Tap + to generate a new token', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _tokens.length,
                  itemBuilder: (context, index) {
                    final token = _tokens[index];
                    final isActive = token['revokedAt'] == null;
                    return Card(
                      color: AppTheme.bgCard,
                      child: ListTile(
                        leading: Icon(
                          Icons.token,
                          color: isActive ? AppTheme.statusGreen : AppTheme.statusRed,
                        ),
                        title: Text(
                          token['deviceId'] ?? token['id'] ?? 'Unknown',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Token: ${(token['token'] ?? '').toString().substring(0, 20)}...',
                              style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                            ),
                            Text(
                              'Created: ${token['createdAt'] ?? '-'}',
                              style: const TextStyle(fontSize: 11),
                            ),
                          ],
                        ),
                        trailing: isActive
                            ? IconButton(
                                icon: const Icon(Icons.block, color: AppTheme.statusRed),
                                onPressed: () => _revokeToken(token['id']),
                              )
                            : const Chip(
                                label: Text('Revoked', style: TextStyle(fontSize: 10)),
                                backgroundColor: Colors.red,
                                labelStyle: TextStyle(color: Colors.white),
                              ),
                      ),
                    );
                  },
                ),
    );
  }
}
