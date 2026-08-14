# VigilOS Mobile App

Flutter-based mobile application for VigilOS fleet management and security monitoring.

## Features

- **Real-time Tracking** - Live vehicle positions and status
- **Panic Alerts** - Emergency button with 2-step confirmation
- **Field Reports** - Submit incident reports with photos/audio
- **Route Planner** - Plan and navigate routes
- **Offline Support** - Continue working without internet

## Development Setup

### Prerequisites

- Flutter SDK 3.16+
- Dart SDK 3.3.4+
- Android Studio / VS Code
- iOS Simulator / Android Emulator

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourorg/vigilos.git
   cd vigilos/vigil-mobile
   ```

2. **Install dependencies**
   ```bash
   flutter pub get
   ```

3. **Run the app**
   ```bash
   # iOS
   flutter run -d ios

   # Android
   flutter run -d android
   ```

## Project Structure

```
lib/
├── main.dart              # App entry point
├── config/               # Configuration
├── models/               # Data models
│   ├── vehicle.dart
│   ├── incident.dart
│   └── user.dart
├── screens/              # App screens
│   ├── auth/
│   ├── dashboard/
│   ├── public/
│   ├── officer/
│   ├── analytics/
│   └── settings/
├── services/             # Business logic
│   ├── api_service.dart
│   ├── auth_service.dart
│   ├── notification_service.dart
│   └── location_service.dart
├── widgets/              # Reusable widgets
│   ├── vehicle_card.dart
│   ├── incident_card.dart
│   └── stat_card.dart
├── helpers/              # Utility helpers
│   ├── date_helper.dart
│   ├── location_helper.dart
│   └── permission_helper.dart
└── utils/                # Utilities
    ├── formatters.dart
    ├── validators.dart
    └── constants.dart
```

## Key Screens

### Splash Screen
- App initialization
- Auto-login check

### Public Transit Screen
- Vehicle monitoring
- Panic button
- Station list

### Officer Dashboard
- Duty toggle
- Field reports
- Incident submission

### Route Planner
- Route optimization
- ETA calculation

## Testing

```bash
# Run all tests
flutter test

# Run with coverage
flutter test --coverage

# Run specific test
flutter test test/widget_test.dart
```

## Building

### Android
```bash
flutter build apk --release
```

### iOS
```bash
flutter build ios --release
```

## Configuration

Update `lib/config/api_config.dart` for your environment:

```dart
class ApiConfig {
  static const String baseUrl = 'http://localhost:3000/api/v1';
  static const String wsUrl = 'ws://localhost:3000/ws';
}
```

## Dependencies

| Package | Purpose |
|---------|---------|
| provider | State management |
| http | API calls |
| shared_preferences | Local storage |
| geolocator | GPS tracking |
| flutter_map | Map display |
| flutter_local_notifications | Push notifications |
| permission_handler | Permission management |

## License

MIT License - see [LICENSE](../LICENSE) for details.
