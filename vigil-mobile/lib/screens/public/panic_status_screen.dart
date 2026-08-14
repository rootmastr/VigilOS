import 'dart:async';
import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';

enum PanicState { idle, confirming, sending, sent, failed }

class PanicStatusScreen extends StatefulWidget {
  final String vehicleId;
  final String vehicleCode;
  final String reason;

  const PanicStatusScreen({
    Key? key,
    required this.vehicleId,
    required this.vehicleCode,
    required this.reason,
  }) : super(key: key);

  @override
  State<PanicStatusScreen> createState() => _PanicStatusScreenState();
}

class _PanicStatusScreenState extends State<PanicStatusScreen>
    with SingleTickerProviderStateMixin {
  PanicState _state = PanicState.confirming;
  int _countdown = 3;
  Timer? _countdownTimer;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  String? _errorMessage;
  int _retryCount = 0;
  static const int _maxRetries = 3;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.2).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _startCountdown();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _countdown--;
        if (_countdown <= 0) {
          timer.cancel();
          _sendPanic();
        }
      });
    });
  }

  void _cancelPanic() {
    _countdownTimer?.cancel();
    Navigator.pop(context);
  }

  Future<void> _sendPanic() async {
    setState(() => _state = PanicState.sending);

    try {
      final success = await ApiService.triggerEmergency(
        widget.vehicleId,
        '[MOBILE PASSENGER PANIC] ${widget.reason}',
      );

      if (success) {
        setState(() => _state = PanicState.sent);
      } else {
        _handleFailure('Server returned an error');
      }
    } catch (e) {
      _handleFailure(e.toString());
    }
  }

  void _handleFailure(String error) {
    _retryCount++;
    if (_retryCount < _maxRetries) {
      // Auto-retry
      setState(() {
        _errorMessage = 'Retrying... ($_retryCount/$_maxRetries)';
        _state = PanicState.sending;
      });
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) _sendPanic();
      });
    } else {
      setState(() {
        _state = PanicState.failed;
        _errorMessage = 'Failed after $_maxRetries attempts. Please call emergency services directly.';
      });
    }
  }

  void _retryPanic() {
    setState(() {
      _retryCount = 0;
      _errorMessage = null;
    });
    _sendPanic();
  }

  void _callEmergency() {
    // In production, use url_launcher to call emergency number
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Calling emergency services...'),
        backgroundColor: AppTheme.statusRed,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: AppTheme.textMuted),
                    onPressed: _state == PanicState.sending ? null : _cancelPanic,
                  ),
                  const Expanded(
                    child: Text(
                      'EMERGENCY PANIC',
                      style: TextStyle(
                        color: AppTheme.statusRed,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: _buildStateWidget(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStateWidget() {
    switch (_state) {
      case PanicState.confirming:
        return _buildConfirmingWidget();
      case PanicState.sending:
        return _buildSendingWidget();
      case PanicState.sent:
        return _buildSentWidget();
      case PanicState.failed:
        return _buildFailedWidget();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildConfirmingWidget() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Pulsing panic icon
        ScaleTransition(
          scale: _pulseAnimation,
          child: Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.statusRed.withOpacity(0.15),
              border: Border.all(color: AppTheme.statusRed, width: 4),
            ),
            child: const Icon(
              Icons.warning_amber_rounded,
              size: 80,
              color: AppTheme.statusRed,
            ),
          ),
        ),
        const SizedBox(height: 32),
        const Text(
          'Hold to Confirm Panic',
          style: TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Release to cancel',
          style: TextStyle(
            color: AppTheme.textMuted,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 16),
        // Countdown display
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppTheme.statusRed.withOpacity(0.2),
            border: Border.all(color: AppTheme.statusRed, width: 3),
          ),
          child: Center(
            child: Text(
              '$_countdown',
              style: const TextStyle(
                color: AppTheme.statusRed,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 32),
        // Info card
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 32),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const Icon(Icons.directions_bus, color: AppTheme.accentBlue, size: 20),
                  const SizedBox(width: 8),
                  Text(widget.vehicleCode, style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.info_outline, color: AppTheme.textMuted, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.reason,
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        // Cancel button
        TextButton(
          onPressed: _cancelPanic,
          child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
        ),
      ],
    );
  }

  Widget _buildSendingWidget() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const CircularProgressIndicator(
          color: AppTheme.statusRed,
          strokeWidth: 3,
        ),
        const SizedBox(height: 24),
        const Text(
          'Sending Panic Alert...',
          style: TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _errorMessage ?? 'Connecting to Command Center',
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildSentWidget() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 120,
          height: 120,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: AppTheme.statusGreen,
          ),
          child: const Icon(Icons.check, size: 60, color: Colors.white),
        ),
        const SizedBox(height: 24),
        const Text(
          'Help is on the way!',
          style: TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Command Center and nearby patrol units have been alerted.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppTheme.textMuted, fontSize: 14),
        ),
        const SizedBox(height: 32),
        // Call emergency button
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _callEmergency,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.statusRed,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            icon: const Icon(Icons.phone, color: Colors.white),
            label: const Text('Call Emergency Services', style: TextStyle(color: Colors.white, fontSize: 16)),
          ),
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Back to Map', style: TextStyle(color: AppTheme.textMuted)),
        ),
      ],
    );
  }

  Widget _buildFailedWidget() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.error_outline, size: 80, color: AppTheme.statusRed),
        const SizedBox(height: 24),
        const Text(
          'Alert Failed to Send',
          style: TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _errorMessage ?? 'Unknown error',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppTheme.textMuted, fontSize: 14),
        ),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _retryPanic,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.statusAmber,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            icon: const Icon(Icons.refresh, color: Colors.white),
            label: const Text('Retry', style: TextStyle(color: Colors.white, fontSize: 16)),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _callEmergency,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.statusRed,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            icon: const Icon(Icons.phone, color: Colors.white),
            label: const Text('Call Emergency Services', style: TextStyle(color: Colors.white, fontSize: 16)),
          ),
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
        ),
      ],
    );
  }
}
