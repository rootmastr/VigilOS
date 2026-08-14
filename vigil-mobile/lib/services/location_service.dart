import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';

class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  StreamSubscription<Position>? _positionSubscription;
  Timer? _locationUpdateTimer;
  
  Position? _currentPosition;
  String? _currentAddress;
  
  bool _isTracking = false;
  double _minDistanceFilter = 10.0; // meters
  int _updateInterval = 5000; // milliseconds
  
  Function(Position)? onPositionUpdate;
  Function(String)? onAddressUpdate;
  Function(String)? onError;

  Position? get currentPosition => _currentPosition;
  String? get currentAddress => _currentAddress;
  bool get isTracking => _isTracking;

  Future<bool> checkPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  Future<bool> requestPermission() async {
    final status = await Permission.locationWhenInUse.request();
    return status.isGranted;
  }

  Future<void> initialize() async {
    final hasPermission = await checkPermission();
    if (!hasPermission) {
      final granted = await requestPermission();
      if (!granted) {
        onError?.call('Location permission not granted');
        return;
      }
    }

    // Get initial position
    await getCurrentPosition();

    // Load settings
    await _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _minDistanceFilter = prefs.getDouble('minDistanceFilter') ?? 10.0;
    _updateInterval = prefs.getInt('updateInterval') ?? 5000;
  }

  Future<void> getCurrentPosition() async {
    try {
      _currentPosition = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      if (_currentPosition != null) {
        await _updateAddress(_currentPosition!);
        onPositionUpdate?.call(_currentPosition!);
      }
    } catch (e) {
      onError?.call('Failed to get current position: $e');
    }
  }

  void startTracking({
    double? minDistanceFilter,
    int? updateInterval,
  }) {
    if (_isTracking) return;

    _isTracking = true;
    _minDistanceFilter = minDistanceFilter ?? _minDistanceFilter;
    _updateInterval = updateInterval ?? _updateInterval;

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: _minDistanceFilter.toInt(),
        timeLimit: const Duration(seconds: 30),
      ),
    ).listen(
      (position) async {
        _currentPosition = position;
        await _updateAddress(position);
        onPositionUpdate?.call(position);
      },
      onError: (error) {
        onError?.call('Location tracking error: $error');
      },
    );

    // Also use timer for regular updates
    _locationUpdateTimer = Timer.periodic(
      Duration(milliseconds: _updateInterval),
      (_) => _sendLocationUpdate(),
    );
  }

  void stopTracking() {
    _isTracking = false;
    _positionSubscription?.cancel();
    _locationUpdateTimer?.cancel();
    _positionSubscription = null;
    _locationUpdateTimer = null;
  }

  Future<void> _updateAddress(Position position) async {
    try {
      final placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );

      if (placemarks.isNotEmpty) {
        final place = placemarks.first;
        _currentAddress = '${place.street}, ${place.subLocality}, ${place.locality}';
        onAddressUpdate?.call(_currentAddress!);
      }
    } catch (e) {
      print('Failed to get address: $e');
    }
  }

  Future<void> _sendLocationUpdate() async {
    if (_currentPosition == null) return;

    // Send to server via API
    // This is handled by the tracking service
  }

  Future<List<Placemark>> getPlacemarks(double lat, double lng) async {
    try {
      return await placemarkFromCoordinates(lat, lng);
    } catch (e) {
      print('Failed to get placemarks: $e');
      return [];
    }
  }

  Future<String> getAddressFromCoordinates(double lat, double lng) async {
    try {
      final placemarks = await placemarkFromCoordinates(lat, lng);
      if (placemarks.isNotEmpty) {
        final place = placemarks.first;
        return '${place.street}, ${place.locality}';
      }
    } catch (e) {
      print('Failed to get address: $e');
    }
    return '';
  }

  Future<double> getDistanceBetween(
    double startLat,
    double startLng,
    double endLat,
    double endLng,
  ) async {
    return Geolocator.distanceBetween(startLat, startLng, endLat, endLng);
  }

  Future<Position?> getLastKnownPosition() async {
    try {
      return await Geolocator.getLastKnownPosition();
    } catch (e) {
      print('Failed to get last known position: $e');
      return null;
    }
  }

  Future<bool> isLocationServiceEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }

  void updateSettings({
    double? minDistanceFilter,
    int? updateInterval,
  }) async {
    if (minDistanceFilter != null) _minDistanceFilter = minDistanceFilter;
    if (updateInterval != null) _updateInterval = updateInterval;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('minDistanceFilter', _minDistanceFilter);
    await prefs.setInt('updateInterval', _updateInterval);

    // Restart tracking if active
    if (_isTracking) {
      stopTracking();
      startTracking();
    }
  }

  void dispose() {
    stopTracking();
  }
}
