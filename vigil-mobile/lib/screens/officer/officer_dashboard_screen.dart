import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../models/officer.dart';
import '../../models/incident.dart';
import '../../services/api_service.dart';
import '../../services/websocket_service.dart';
import '../../services/auth_service.dart';
import '../profile_screen.dart';

class OfficerDashboardScreen extends StatefulWidget {
  const OfficerDashboardScreen({Key? key}) : super(key: key);

  @override
  State<OfficerDashboardScreen> createState() => _OfficerDashboardScreenState();
}

class _OfficerDashboardScreenState extends State<OfficerDashboardScreen> {
  Officer currentOfficer = Officer(
    id: AuthService.currentUser?.officerId ?? 'OFF-101',
    name: AuthService.currentUser?.name ?? 'Officer',
    badgeNo: 'PTR-8821',
    dutyStatus: 'On Duty',
    unitId: 'PATROL-01',
    phone: '+62 811-9988-7766',
  );

  List<Incident> activeIncidents = [];
  List<Map<String, dynamic>> _pendingDrafts = [];
  late WebSocketService wsService;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    initWebSocket();
    _loadPendingDrafts();
  }

  void initWebSocket() {
    wsService = WebSocketService();
    wsService.onEmergencyAlert = (incident) {
      setState(() {
        activeIncidents.insert(0, incident);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('🚨 HIGH PRIORITY DISPATCH: ${incident.vehicleCode} - ${incident.type}'),
          backgroundColor: AppTheme.statusRed,
          duration: const Duration(seconds: 5),
        ),
      );
    };
    wsService.connect();
  }

  @override
  void dispose() {
    wsService.disconnect();
    super.dispose();
  }

  // Offline draft management
  Future<void> _loadPendingDrafts() async {
    final prefs = await SharedPreferences.getInstance();
    final draftsJson = prefs.getString('pending_field_reports') ?? '[]';
    final List<dynamic> draftsList = json.decode(draftsJson);
    setState(() {
      _pendingDrafts = draftsList.cast<Map<String, dynamic>>();
    });
  }

  Future<void> _saveDraft(Map<String, dynamic> draft) async {
    final prefs = await SharedPreferences.getInstance();
    _pendingDrafts.add(draft);
    await prefs.setString('pending_field_reports', json.encode(_pendingDrafts));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Draft saved offline'), backgroundColor: AppTheme.statusAmber),
      );
    }
  }

  Future<void> _syncDrafts() async {
    if (_pendingDrafts.isEmpty) return;

    int synced = 0;
    for (final draft in List.from(_pendingDrafts)) {
      try {
        final response = await ApiService.resolveIncident(
          draft['incidentId'],
          draft['notes'],
          draft['photoUrl'] ?? '',
        );
        if (response) {
          _pendingDrafts.remove(draft);
          synced++;
        }
      } catch (e) {
        // Keep in queue for next sync
      }
    }

    if (synced > 0) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('pending_field_reports', json.encode(_pendingDrafts));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Synced $synced draft(s)'), backgroundColor: AppTheme.statusGreen),
        );
      }
    }
  }

  Future<void> _updateStatus(String status) async {
    setState(() {
      currentOfficer = currentOfficer.copyWith(dutyStatus: status);
    });
    wsService.updateOfficerStatus(currentOfficer.id, status);
    await ApiService.updateOfficerStatus(currentOfficer.id, status);
  }

  Future<void> _launchNavigation(double lat, double lng) async {
    final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  void _showReportDialog(Incident incident) {
    final notesCtrl = TextEditingController();
    String? selectedIncidentType = 'General Incident';
    String? selectedSeverity = 'Medium';
    String? _photoPath;
    bool _isSaving = false;

    final incidentTypes = [
      'General Incident',
      'Medical Emergency',
      'Traffic Accident',
      'Fire Hazard',
      'Security Threat',
      'Infrastructure Issue',
      'Public Disturbance',
    ];

    final severities = ['Low', 'Medium', 'High', 'Critical'];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
            left: 16,
            right: 16,
            top: 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Handle bar
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(color: AppTheme.textMuted, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const SizedBox(height: 16),
                // Title
                Row(
                  children: [
                    const Icon(Icons.assignment, color: AppTheme.accentBlue),
                    const SizedBox(width: 8),
                    Text('Field Report — ${incident.vehicleCode}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppTheme.textPrimary)),
                  ],
                ),
                const SizedBox(height: 16),
                // Incident Type Dropdown
                DropdownButtonFormField<String>(
                  value: selectedIncidentType,
                  dropdownColor: AppTheme.bgSecondary,
                  decoration: const InputDecoration(
                    labelText: 'Incident Type',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.category, size: 20),
                  ),
                  items: incidentTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                  onChanged: (val) => setModalState(() => selectedIncidentType = val),
                ),
                const SizedBox(height: 12),
                // Severity Dropdown
                DropdownButtonFormField<String>(
                  value: selectedSeverity,
                  dropdownColor: AppTheme.bgSecondary,
                  decoration: const InputDecoration(
                    labelText: 'Severity Level',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.warning_amber, size: 20),
                  ),
                  items: severities.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                  onChanged: (val) => setModalState(() => selectedSeverity = val),
                ),
                const SizedBox(height: 12),
                // Notes
                TextField(
                  controller: notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Field Notes',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                  maxLines: 4,
                ),
                const SizedBox(height: 12),
                // Photo upload
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final XFile? image = await _picker.pickImage(source: ImageSource.camera);
                          if (image != null) {
                            setModalState(() => _photoPath = image.path);
                          }
                        },
                        icon: const Icon(Icons.camera_alt, size: 18),
                        label: const Text('Camera'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final XFile? image = await _picker.pickImage(source: ImageSource.gallery);
                          if (image != null) {
                            setModalState(() => _photoPath = image.path);
                          }
                        },
                        icon: const Icon(Icons.photo_library, size: 18),
                        label: const Text('Gallery'),
                      ),
                    ),
                  ],
                ),
                if (_photoPath != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: AppTheme.statusGreen.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle, color: AppTheme.statusGreen, size: 16),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Photo attached', style: TextStyle(color: AppTheme.statusGreen, fontSize: 12))),
                        IconButton(
                          icon: const Icon(Icons.close, size: 16),
                          onPressed: () => setModalState(() => _photoPath = null),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                // Action buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _isSaving ? null : () {
                          // Save as offline draft
                          _saveDraft({
                            'incidentId': incident.id,
                            'type': selectedIncidentType,
                            'severity': selectedSeverity,
                            'notes': notesCtrl.text,
                            'photoPath': _photoPath,
                            'timestamp': DateTime.now().toIso8601String(),
                          });
                          Navigator.pop(ctx);
                        },
                        child: const Text('Save Draft'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.statusGreen),
                        onPressed: _isSaving ? null : () async {
                          setModalState(() => _isSaving = true);
                          // Submit report
                          final ok = await ApiService.resolveIncident(
                            incident.id,
                            '[${selectedIncidentType ?? "General"}] ${notesCtrl.text}',
                            _photoPath ?? '',
                          );
                          if (ok) {
                            setState(() {
                              activeIncidents.removeWhere((i) => i.id == incident.id);
                            });
                            if (mounted) Navigator.pop(ctx);
                          } else {
                            // Save as draft if offline
                            _saveDraft({
                              'incidentId': incident.id,
                              'type': selectedIncidentType,
                              'severity': selectedSeverity,
                              'notes': notesCtrl.text,
                              'photoPath': _photoPath,
                              'timestamp': DateTime.now().toIso8601String(),
                            });
                            if (mounted) Navigator.pop(ctx);
                          }
                        },
                        child: _isSaving
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Submit Report', style: TextStyle(color: Colors.white)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Patrol Officer Portal'),
        actions: [
          // Sync drafts button
          if (_pendingDrafts.isNotEmpty)
            IconButton(
              icon: Badge(
                label: Text('${_pendingDrafts.length}', style: const TextStyle(color: Colors.white, fontSize: 10)),
                child: const Icon(Icons.sync, color: AppTheme.statusAmber),
              ),
              onPressed: _syncDrafts,
              tooltip: 'Sync pending drafts',
            ),
          IconButton(
            icon: const Icon(Icons.person_outline, color: AppTheme.textPrimary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (context) => const ProfileScreen()));
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Officer Profile & Status Card
            Card(
              color: AppTheme.bgCard,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: AppTheme.statusGreen,
                          child: const Icon(Icons.shield, color: Colors.white),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(currentOfficer.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            Text('Badge: ${currentOfficer.badgeNo} • ${currentOfficer.unitId}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                          ],
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    // Large Duty Toggle (PRD 3.2)
                    const Text('DUTY STATUS', style: TextStyle(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    _buildDutyToggle(),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Pending drafts indicator
            if (_pendingDrafts.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppTheme.statusAmber.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.statusAmber),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.cloud_upload, color: AppTheme.statusAmber, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('${_pendingDrafts.length} pending draft(s) to sync', style: const TextStyle(color: AppTheme.statusAmber, fontSize: 12)),
                    ),
                    TextButton(
                      onPressed: _syncDrafts,
                      child: const Text('Sync Now', style: TextStyle(color: AppTheme.statusAmber)),
                    ),
                  ],
                ),
              ),
            const Text('ACTIVE EMERGENCY DISPATCHES', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted)),
            const SizedBox(height: 8),
            Expanded(
              child: activeIncidents.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.check_circle_outline, color: AppTheme.statusGreen, size: 48),
                          SizedBox(height: 8),
                          Text('All sector clear', style: TextStyle(color: AppTheme.textMuted)),
                        ],
                      ),
                    )
                  : ListView.builder(
                      itemCount: activeIncidents.length,
                      itemBuilder: (ctx, idx) {
                        final inc = activeIncidents[idx];
                        return Card(
                          color: AppTheme.statusRed.withOpacity(0.1),
                          shape: RoundedRectangleBorder(
                            side: const BorderSide(color: AppTheme.statusRed),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          margin: const EdgeInsets.only(bottom: 12),
                          child: Padding(
                            padding: const EdgeInsets.all(12.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(inc.vehicleCode, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textPrimary)),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(color: AppTheme.statusRed, borderRadius: BorderRadius.circular(4)),
                                      child: const Text('HIGH PRIORITY', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(inc.details, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    Expanded(
                                      child: ElevatedButton.icon(
                                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentBlue),
                                        icon: const Icon(Icons.navigation, size: 16),
                                        label: const Text('Navigate'),
                                        onPressed: () => _launchNavigation(inc.lat, inc.lng),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: ElevatedButton.icon(
                                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.statusGreen),
                                        icon: const Icon(Icons.assignment_turned_in, size: 16),
                                        label: const Text('Field Report'),
                                        onPressed: () => _showReportDialog(inc),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDutyToggle() {
    final isOnDuty = currentOfficer.dutyStatus == 'On Duty';
    final isBusy = currentOfficer.dutyStatus == 'Busy';

    return Row(
      children: [
        // On Duty toggle
        Expanded(
          child: GestureDetector(
            onTap: () => _updateStatus(isOnDuty ? 'Available' : 'On Duty'),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: isOnDuty ? AppTheme.statusGreen : AppTheme.bgSecondary,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isOnDuty ? AppTheme.statusGreen : AppTheme.textMuted.withOpacity(0.3),
                  width: 2,
                ),
              ),
              child: Column(
                children: [
                  Icon(
                    isOnDuty ? Icons.check_circle : Icons.circle_outlined,
                    color: isOnDuty ? Colors.white : AppTheme.textMuted,
                    size: 28,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'ON DUTY',
                    style: TextStyle(
                      color: isOnDuty ? Colors.white : AppTheme.textMuted,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // Off Duty toggle
        Expanded(
          child: GestureDetector(
            onTap: () => _updateStatus(isOnDuty || isBusy ? 'Off Duty' : 'On Duty'),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: !isOnDuty && !isBusy ? AppTheme.statusRed : AppTheme.bgSecondary,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: !isOnDuty && !isBusy ? AppTheme.statusRed : AppTheme.textMuted.withOpacity(0.3),
                  width: 2,
                ),
              ),
              child: Column(
                children: [
                  Icon(
                    !isOnDuty && !isBusy ? Icons.cancel : Icons.circle_outlined,
                    color: !isOnDuty && !isBusy ? Colors.white : AppTheme.textMuted,
                    size: 28,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'OFF DUTY',
                    style: TextStyle(
                      color: !isOnDuty && !isBusy ? Colors.white : AppTheme.textMuted,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
