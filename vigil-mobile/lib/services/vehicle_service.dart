import 'dart:async';
import 'api_service.dart';
import '../models/vehicle.dart';

class VehicleService {
  static final VehicleService _instance = VehicleService._internal();
  factory VehicleService() => _instance;
  VehicleService._internal();

  final ApiService _api = ApiService();
  Timer? _refreshTimer;

  List<Vehicle> _vehicles = [];
  Vehicle? _selectedVehicle;

  Function(List<Vehicle>)? onVehiclesUpdate;
  Function(Vehicle)? onVehicleSelected;

  List<Vehicle> get vehicles => List.unmodifiable(_vehicles);
  Vehicle? get selectedVehicle => _selectedVehicle;

  Future<void> initialize() async {
    await fetchVehicles();
    _startAutoRefresh();
  }

  Future<void> fetchVehicles({String? status, String? type}) async {
    try {
      final response = await _api.getVehicles(status: status, type: type);
      _vehicles = response;
      onVehiclesUpdate?.call(_vehicles);
    } catch (e) {
      print('Failed to fetch vehicles: $e');
    }
  }

  void selectVehicle(Vehicle? vehicle) {
    _selectedVehicle = vehicle;
    onVehicleSelected?.call(vehicle);
  }

  Vehicle? getVehicleById(String id) {
    try {
      return _vehicles.firstWhere((v) => v.id == id);
    } catch (e) {
      return null;
    }
  }

  Vehicle? getVehicleByCode(String code) {
    try {
      return _vehicles.firstWhere((v) => v.code == code);
    } catch (e) {
      return null;
    }
  }

  List<Vehicle> getActiveVehicles() {
    return _vehicles.where((v) => v.status == 'ACTIVE').toList();
  }

  List<Vehicle> searchVehicles(String query) {
    final lowercaseQuery = query.toLowerCase();
    return _vehicles.where((v) {
      return v.code.toLowerCase().contains(lowercaseQuery) ||
             v.name.toLowerCase().contains(lowercaseQuery);
    }).toList();
  }

  void _startAutoRefresh() {
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => fetchVehicles(),
    );
  }

  void stopAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  void dispose() {
    stopAutoRefresh();
  }
}
