import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'public/public_transit_screen.dart';
import 'officer/officer_dashboard_screen.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppTheme.accentBlue,
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(color: Color(0x403B82F6), blurRadius: 20, offset: Offset(0, 4))
                ],
              ),
              child: const Icon(Icons.shield_outlined, size: 40, color: Colors.white),
            ),
            const SizedBox(height: 24),
            const Text(
              'VigilOS Mobile',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Enterprise Fleet & Smart City Mobile Gateway',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 48),
            
            // Role Option 1: Public Transit User
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.bgCard,
                foregroundColor: AppTheme.textPrimary,
                side: const BorderSide(color: AppTheme.accentBlue, width: 1),
                padding: const EdgeInsets.all(18),
              ),
              icon: const Icon(Icons.directions_bus, color: AppTheme.accentBlue, size: 28),
              label: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Public User Mode', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  Text('Transit Live Map, Station ETAs & Safety Panic', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (context) => const PublicTransitScreen()),
                );
              },
            ),
            
            const SizedBox(height: 16),
            
            // Role Option 2: Patrol Officer
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.bgCard,
                foregroundColor: AppTheme.textPrimary,
                side: const BorderSide(color: AppTheme.statusGreen, width: 1),
                padding: const EdgeInsets.all(18),
              ),
              icon: const Icon(Icons.local_police, color: AppTheme.statusGreen, size: 28),
              label: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Patrol Officer Portal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  Text('High-Priority Alerts, Duty Status & Field Logs', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                ],
              ),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (context) => const OfficerDashboardScreen()),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
