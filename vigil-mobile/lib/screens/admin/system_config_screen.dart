import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';

class SystemConfigScreen extends StatefulWidget {
  const SystemConfigScreen({Key? key}) : super(key: key);

  @override
  State<SystemConfigScreen> createState() => _SystemConfigScreenState();
}

class _SystemConfigScreenState extends State<SystemConfigScreen> {
  List<dynamic> _tenants = [];
  List<dynamic> _roles = [];
  Map<String, dynamic>? _systemStatus;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final token = AuthService.token;
      final headers = {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

      final tenantsFuture = http.get(Uri.parse('${ApiService.baseUrl}/portal/tenants'), headers: headers);
      final rolesFuture = http.get(Uri.parse('${ApiService.baseUrl}/portal/roles'), headers: headers);
      final statusFuture = ApiService.getSystemStatus();

      final tenantsRes = json.decode((await tenantsFuture).body);
      final rolesRes = json.decode((await rolesFuture).body);
      final statusData = await statusFuture;

      if (mounted) {
        setState(() {
          _tenants = tenantsRes['data'] ?? [];
          _roles = rolesRes['data'] ?? [];
          _systemStatus = statusData;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('System Configuration')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // System Status
                  if (_systemStatus != null) ...[
                    const Text('SYSTEM STATUS',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                    const SizedBox(height: 8),
                    Card(
                      color: AppTheme.bgCard,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            _buildStatusRow('Status', _systemStatus!['status'] ?? '-'),
                            _buildStatusRow('Active Units', '${_systemStatus!['activeUnits'] ?? 0}'),
                            _buildStatusRow('Active Incidents', '${_systemStatus!['activeIncidents'] ?? 0}'),
                            _buildStatusRow('Warning Units', '${_systemStatus!['warningUnits'] ?? 0}'),
                            _buildStatusRow('Tenant', _systemStatus!['tenant'] ?? '-'),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Tenants
                  const Text('TENANTS',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 8),
                  if (_tenants.isEmpty)
                    const Card(
                      color: AppTheme.bgCard,
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No tenants found', style: TextStyle(color: AppTheme.textMuted)),
                      ),
                    )
                  else
                    ..._tenants.map((t) => Card(
                          color: AppTheme.bgCard,
                          child: ListTile(
                            leading: const Icon(Icons.business, color: AppTheme.accentBlue),
                            title: Text(t['name'] ?? t['id'] ?? 'Unknown'),
                            subtitle: Text(t['id'] ?? '', style: const TextStyle(fontSize: 12)),
                            trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                          ),
                        )),
                  const SizedBox(height: 24),

                  // Roles
                  const Text('ROLES & PERMISSIONS',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
                  const SizedBox(height: 8),
                  if (_roles.isEmpty)
                    const Card(
                      color: AppTheme.bgCard,
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No roles found', style: TextStyle(color: AppTheme.textMuted)),
                      ),
                    )
                  else
                    ..._roles.map((r) => Card(
                          color: AppTheme.bgCard,
                          child: ListTile(
                            leading: const Icon(Icons.security, color: AppTheme.statusAmber),
                            title: Text(r['name'] ?? r['id'] ?? 'Unknown'),
                            subtitle: Text(
                              (r['permissions'] as List?)?.join(', ') ?? '',
                              style: const TextStyle(fontSize: 11),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppTheme.textSecondary)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
