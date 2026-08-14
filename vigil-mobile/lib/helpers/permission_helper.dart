import 'package:permission_handler/permission_handler.dart';

class PermissionHelper {
  static Future<bool> checkLocationPermission() async {
    final status = await Permission.location.status;
    return status.isGranted;
  }

  static Future<bool> requestLocationPermission() async {
    final status = await Permission.location.request();
    return status.isGranted;
  }

  static Future<bool> checkCameraPermission() async {
    final status = await Permission.camera.status;
    return status.isGranted;
  }

  static Future<bool> requestCameraPermission() async {
    final status = await Permission.camera.request();
    return status.isGranted;
  }

  static Future<bool> checkStoragePermission() async {
    final status = await Permission.storage.status;
    return status.isGranted;
  }

  static Future<bool> requestStoragePermission() async {
    final status = await Permission.storage.request();
    return status.isGranted;
  }

  static Future<bool> checkMicrophonePermission() async {
    final status = await Permission.microphone.status;
    return status.isGranted;
  }

  static Future<bool> requestMicrophonePermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted;
  }

  static Future<bool> checkNotificationPermission() async {
    final status = await Permission.notification.status;
    return status.isGranted;
  }

  static Future<bool> requestNotificationPermission() async {
    final status = await Permission.notification.request();
    return status.isGranted;
  }

  static Future<bool> checkAllRequiredPermissions() async {
    final location = await checkLocationPermission();
    final camera = await checkCameraPermission();
    final storage = await checkStoragePermission();
    final microphone = await checkMicrophonePermission();
    
    return location && camera && storage && microphone;
  }

  static Future<Map<String, bool>> requestAllRequiredPermissions() async {
    final location = await requestLocationPermission();
    final camera = await requestCameraPermission();
    final storage = await requestStoragePermission();
    final microphone = await requestMicrophonePermission();
    
    return {
      'location': location,
      'camera': camera,
      'storage': storage,
      'microphone': microphone,
    };
  }

  static Future<bool> openAppSettingsIfDenied(PermissionStatus status) async {
    if (status.isPermanentlyDenied) {
      return await openAppSettings();
    }
    return false;
  }

  static Future<PermissionStatus> getStatus(Permission permission) async {
    return await permission.status;
  }

  static Future<bool> isGranted(Permission permission) async {
    final status = await permission.status;
    return status.isGranted;
  }

  static Future<bool> isDenied(Permission permission) async {
    final status = await permission.status;
    return status.isDenied;
  }

  static Future<bool> isPermanentlyDenied(Permission permission) async {
    final status = await permission.status;
    return status.isPermanentlyDenied;
  }

  static String getPermissionName(Permission permission) {
    switch (permission) {
      case Permission.location:
        return 'Location';
      case Permission.camera:
        return 'Camera';
      case Permission.storage:
        return 'Storage';
      case Permission.microphone:
        return 'Microphone';
      case Permission.notification:
        return 'Notifications';
      default:
        return 'Unknown';
    }
  }

  static String getPermissionDeniedMessage(Permission permission) {
    final name = getPermissionName(permission);
    return '$name permission is required for this feature. Please enable it in app settings.';
  }
}
