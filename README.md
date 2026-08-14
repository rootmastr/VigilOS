# VigilOS - Public Transit Security & Fleet Management Platform

[![CI/CD](https://github.com/yourorg/vigilos/actions/workflows/ci.yml/badge.svg)](https://github.com/yourorg/vigilos/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/yourorg/vigilos/branch/main/graph/badge.svg)](https://codecov.io/gh/yourorg/vigilos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

VigilOS is a comprehensive fleet management and security monitoring platform designed for public transit authorities and vehicle operators. It provides real-time tracking, emergency response, incident management, and analytics capabilities.

### Key Features

- **Real-time Vehicle Tracking** - Monitor fleet positions with live telemetry
- **Emergency Response** - Panic button alerts with instant notification
- **Incident Management** - Report, track, and resolve security incidents
- **Field Reports** - Mobile reporting with photo/audio capture
- **Analytics Dashboard** - Fleet performance and safety metrics
- **Multi-tenant Architecture** - Support for multiple organizations
- **Offline Capabilities** - Continue operations without internet

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VigilOS Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Command      │  │  Mobile App  │  │  Tenant      │      │
│  │  Center       │  │  (Flutter)   │  │  Portal      │      │
│  │  (React)      │  │              │  │  (React)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                │
│         └─────────────────┼─────────────────┘                │
│                           │                                  │
│                    ┌──────┴───────┐                          │
│                    │  API Gateway │                          │
│                    │  (Node.js)   │                          │
│                    └──────┬───────┘                          │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐                │
│         │                 │                 │                │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐      │
│  │  PostgreSQL  │  │  Redis       │  │  InfluxDB    │      │
│  │  (Database)  │  │  (Cache)     │  │  (Time Series│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- **Command Center**: React, Vite, Tailwind CSS, Leaflet Maps
- **Mobile App**: Flutter, Dart
- **Tenant Portal**: React, Vite, Tailwind CSS

### Backend
- **API Server**: Node.js, Express
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Time Series**: InfluxDB
- **Message Queue**: MQTT (Mosquitto)
- **Real-time**: WebSocket

### DevOps
- **Containerization**: Docker, Docker Compose
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus, Grafana

## Getting Started

### Prerequisites

- Node.js 20+
- Docker 20.10+
- Docker Compose 2.0+
- Flutter 3.16+

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourorg/vigilos.git
   cd vigilos
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start with Docker**
   ```bash
   docker-compose up -d
   ```

4. **Initialize database**
   ```bash
   docker-compose exec server npx prisma migrate deploy
   docker-compose exec server npx prisma db seed
   ```

5. **Access the application**
   - Frontend: http://localhost:80
   - API: http://localhost:3000
   - Grafana: http://localhost:3001

### Development Setup

1. **Install dependencies**
   ```bash
   # Backend
   cd vigil-server
   npm install

   # Frontend
   cd ../vigil-app
   npm install
   ```

2. **Start development servers**
   ```bash
   # Backend
   cd vigil-server
   npm run dev

   # Frontend (in another terminal)
   cd vigil-app
   npm run dev
   ```

## Project Structure

```
vigilos/
├── vigil-server/           # Backend API server
│   ├── src/
│   │   ├── api/           # API routes
│   │   ├── cache/         # Redis cache service
│   │   ├── database/      # Database adapters
│   │   ├── mqtt/          # MQTT broker simulator
│   │   ├── monitoring/    # Metrics and monitoring
│   │   ├── security/      # Security middleware
│   │   ├── telemetry/     # InfluxDB time series
│   │   └── websocket/     # WebSocket server
│   ├── prisma/            # Database schema
│   └── tests/             # Test suites
├── vigil-app/             # React frontend
│   └── src/
│       ├── components/    # UI components
│       ├── hooks/         # React hooks
│       ├── services/      # API services
│       └── store/         # Redux store
├── vigil-mobile/          # Flutter mobile app
│   └── lib/
│       ├── models/        # Data models
│       ├── screens/       # App screens
│       ├── services/      # Business logic
│       └── widgets/       # Reusable widgets
├── firmware/              # IoT firmware
├── monitoring/            # Monitoring configs
└── docs/                  # Documentation
```

## API Documentation

See [API Documentation](vigil-server/docs/API.md) for complete API reference.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/login | User authentication |
| GET | /api/v1/vehicles | List vehicles |
| GET | /api/v1/incidents | List incidents |
| POST | /api/v1/incidents | Create incident |
| POST | /api/v1/emergency/panic | Trigger panic alert |
| GET | /api/v1/analytics/dashboard | Dashboard metrics |

## Mobile App

See [Mobile App Development Guide](vigil-mobile/README.md) for Flutter app development.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: https://docs.vigilos.com
- **Issues**: https://github.com/yourorg/vigilos/issues
- **Email**: support@vigilos.com

## Acknowledgments

- [Leaflet](https://leafletjs.com/) - Maps
- [Flutter](https://flutter.dev/) - Mobile framework
- [Express](https://expressjs.com/) - Node.js framework
- [Prisma](https://www.prisma.io/) - Database ORM
