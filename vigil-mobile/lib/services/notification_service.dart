import 'dart:convert';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/incident.dart';
import 'api_service.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  String? _fcmToken;
  Function(String)? onTokenRefresh;
  Function(RemoteMessage)? onMessageReceived;
  Function(String)? onNotificationTap;

  Future<void> initialize() async {
    await _requestPermission();
    await _initializeLocalNotifications();
    await _getFCMToken();
    _configureMessageHandlers();
  }

  Future<void> _requestPermission() async {
    final settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
      criticalAlert: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');
    } else {
      print('User declined or has not granted permission');
    }
  }

  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );
  }

  Future<void> _getFCMToken() async {
    _fcmToken = await _firebaseMessaging.getToken();
    print('FCM Token: $_fcmToken');

    _firebaseMessaging.onTokenRefresh.listen((token) {
      _fcmToken = token;
      onTokenRefresh?.call(token);
    });
  }

  void _configureMessageHandlers() {
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);
    _handleTerminatedState();
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    print('Foreground message: ${message.messageId}');
    await _showLocalNotification(message);
    onMessageReceived?.call(message);
    _processMessageData(message.data);
  }

  Future<void> _handleMessageOpenedApp(RemoteMessage message) async {
    print('Message opened app: ${message.messageId}');
    _handleNotificationNavigation(message.data);
  }

  Future<void> _handleTerminatedState() async {
    final initialMessage = await _firebaseMessaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationNavigation(initialMessage.data);
    }
  }

  Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final androidDetails = AndroidNotificationDetails(
      'vigilos_channel',
      'VigilOS Notifications',
      channelDescription: 'Notifications for VigilOS alerts and updates',
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      color: const Color(0xFFFF5252),
      playSound: true,
      enableVibration: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      message.hashCode,
      notification.title,
      notification.body,
      details,
      payload: jsonEncode(message.data),
    );
  }

  void _processMessageData(Map<String, dynamic> data) {
    final type = data['type'];

    switch (type) {
      case 'PANIC_ALERT':
        _handlePanicAlert(data);
        break;
      case 'SPEED_VIOLATION':
        _handleSpeedViolation(data);
        break;
      case 'GEOFENCE_BREACH':
        _handleGeofenceBreach(data);
        break;
      case 'INCIDENT_UPDATE':
        _handleIncidentUpdate(data);
        break;
      default:
        print('Unknown message type: $type');
    }
  }

  void _handlePanicAlert(Map<String, dynamic> data) {
    print('Panic alert received: ${data['vehicleId']}');
  }

  void _handleSpeedViolation(Map<String, dynamic> data) {
    print('Speed violation: ${data['speed']} km/h');
  }

  void _handleGeofenceBreach(Map<String, dynamic> data) {
    print('Geofence breach: ${data['vehicleId']}');
  }

  void _handleIncidentUpdate(Map<String, dynamic> data) {
    print('Incident updated: ${data['incidentId']}');
  }

  void _handleNotificationNavigation(Map<String, dynamic> data) {
    final type = data['type'];
    onNotificationTap?.call(type);
  }

  void _onNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload != null) {
      final data = jsonDecode(payload) as Map<String, dynamic>;
      _handleNotificationNavigation(data);
    }
  }

  Future<void> subscribeToTopic(String topic) async {
    await _firebaseMessaging.subscribeToTopic(topic);
  }

  Future<void> unsubscribeFromTopic(String topic) async {
    await _firebaseMessaging.unsubscribeFromTopic(topic);
  }

  Future<void> updateTokenOnServer() async {
    if (_fcmToken != null) {
      await ApiService.updateFCMToken(_fcmToken!);
    }
  }

  String? get fcmToken => _fcmToken;

  Future<void> showTestNotification() async {
    const androidDetails = AndroidNotificationDetails(
      'vigilos_channel',
      'VigilOS Notifications',
      channelDescription: 'Test notification',
      importance: Importance.high,
      priority: Priority.high,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: DarwinNotificationDetails(),
    );

    await _localNotifications.show(
      0,
      'Test Notification',
      'This is a test notification from VigilOS',
      details,
    );
  }
}
