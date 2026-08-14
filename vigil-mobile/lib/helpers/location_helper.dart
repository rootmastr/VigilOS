import 'dart:math';
import '../utils/constants.dart';

class LocationHelper {
  static double calculateDistance(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    const earthRadius = 6371000; // meters
    
    final dLat = _toRadians(lat2 - lat1);
    final dLng = _toRadians(lng2 - lng1);
    
    final a = sin(dLat / 2) * sin(dLat / 2) +
              cos(_toRadians(lat1)) * cos(_toRadians(lat2)) *
              sin(dLng / 2) * sin(dLng / 2);
    
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    
    return earthRadius * c;
  }

  static double calculateBearing(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    final dLng = _toRadians(lng2 - lng1);
    
    final y = sin(dLng) * cos(_toRadians(lat2));
    final x = cos(_toRadians(lat1)) * sin(_toRadians(lat2)) -
              sin(_toRadians(lat1)) * cos(_toRadians(lat2)) * cos(dLng);
    
    final bearing = _toDegrees(atan2(y, x));
    
    return (bearing + 360) % 360;
  }

  static bool isWithinRadius(
    double centerLat,
    double centerLng,
    double pointLat,
    double pointLng,
    double radiusMeters,
  ) {
    final distance = calculateDistance(centerLat, centerLng, pointLat, pointLng);
    return distance <= radiusMeters;
  }

  static bool isWithinBoundingBox(
    double northEastLat,
    double northEastLng,
    double southWestLat,
    double southWestLng,
    double pointLat,
    double pointLng,
  ) {
    return pointLat >= southWestLat &&
           pointLat <= northEastLat &&
           pointLng >= southWestLng &&
           pointLng <= northEastLng;
  }

  static bool isInsidePolygon(
    double pointLat,
    double pointLng,
    List<List<double>> polygon,
  ) {
    bool inside = false;
    
    for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final xi = polygon[i][0];
      final yi = polygon[i][1];
      final xj = polygon[j][0];
      final yj = polygon[j][1];
      
      final intersect = ((yi > pointLng) != (yj > pointLng)) &&
          (pointLat < (xj - xi) * (pointLng - yi) / (yj - yi) + xi);
      
      if (intersect) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  static LatLng getCenterPoint(List<LatLng> points) {
    if (points.isEmpty) {
      return const LatLng(
        AppConstants.defaultLatitude,
        AppConstants.defaultLongitude,
      );
    }
    
    double totalLat = 0;
    double totalLng = 0;
    
    for (final point in points) {
      totalLat += point.latitude;
      totalLng += point.longitude;
    }
    
    return LatLng(
      totalLat / points.length,
      totalLng / points.length,
    );
  }

  static LatLngBounds getBounds(List<LatLng> points) {
    if (points.isEmpty) {
      return LatLngBounds(
        const LatLng(
          AppConstants.defaultLatitude - 0.01,
          AppConstants.defaultLongitude - 0.01,
        ),
        const LatLng(
          AppConstants.defaultLatitude + 0.01,
          AppConstants.defaultLongitude + 0.01,
        ),
      );
    }
    
    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;
    
    for (final point in points) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }
    
    return LatLngBounds(
      LatLng(minLat, minLng),
      LatLng(maxLat, maxLng),
    );
  }

  static List<LatLng> simplifyPath(
    List<LatLng> points, {
    double tolerance = 10.0,
  }) {
    if (points.length <= 2) {
      return points;
    }
    
    final result = <LatLng>[points.first];
    
    for (int i = 1; i < points.length - 1; i++) {
      final prev = result.last;
      final next = points[i + 1];
      
      final distance = calculateDistance(
        prev.latitude,
        prev.longitude,
        points[i].latitude,
        points[i].longitude,
      );
      
      if (distance >= tolerance) {
        result.add(points[i]);
      }
    }
    
    result.add(points.last);
    
    return result;
  }

  static String getCompassDirection(double bearing) {
    const directions = [
      'N', 'NE', 'E', 'SE',
      'S', 'SW', 'W', 'NW'
    ];
    
    final index = ((bearing + 22.5) / 45).floor() % 8;
    return directions[index];
  }

  static String formatCoordinate(double coordinate, {bool isLatitude = true}) {
    final direction = isLatitude
        ? (coordinate >= 0 ? 'N' : 'S')
        : (coordinate >= 0 ? 'E' : 'W');
    
    return '${coordinate.abs().toStringAsFixed(4)}° $direction';
  }

  static double _toRadians(double degrees) {
    return degrees * pi / 180;
  }

  static double _toDegrees(double radians) {
    return radians * 180 / pi;
  }
}

class LatLng {
  final double latitude;
  final double longitude;

  const LatLng(this.latitude, this.longitude);

  @override
  String toString() => 'LatLng($latitude, $longitude)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LatLng &&
          runtimeType == other.runtimeType &&
          latitude == other.latitude &&
          longitude == other.longitude;

  @override
  int get hashCode => latitude.hashCode ^ longitude.hashCode;
}

class LatLngBounds {
  final LatLng southWest;
  final LatLng northEast;

  const LatLngBounds(this.southWest, this.northEast);

  @override
  String toString() => 'LatLngBounds($southWest, $northEast)';
}
