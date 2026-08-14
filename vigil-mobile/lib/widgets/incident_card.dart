import 'package:flutter/material.dart';
import '../models/incident.dart';
import '../utils/formatters.dart';
import '../utils/constants.dart';

class IncidentCard extends StatelessWidget {
  final Incident incident;
  final VoidCallback? onTap;
  final VoidCallback? onResolve;
  final bool showVehicle;
  final bool showTimeline;

  const IncidentCard({
    super.key,
    required this.incident,
    this.onTap,
    this.onResolve,
    this.showVehicle = true,
    this.showTimeline = false,
  });

  @override
  Widget build(BuildContext context) {
    final severityColor = Color(
      IncidentSeverityColors.colors[incident.severity] ?? 0xFFFFEB3B,
    );

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: severityColor.withOpacity(0.5),
          width: incident.severity == 'CRITICAL' ? 2 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(context, severityColor),
              const SizedBox(height: 12),
              _buildContent(context),
              if (showTimeline && incident.timeline.isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildTimeline(context),
              ],
              if (incident.status != 'RESOLVED' &&
                  incident.status != 'CLOSED') ...[
                const SizedBox(height: 12),
                _buildActions(context),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, Color severityColor) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: severityColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            _getIncidentIcon(incident.type),
            color: severityColor,
            size: 24,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _formatIncidentType(incident.type),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              if (showVehicle && incident.vehicle != null)
                Text(
                  '${incident.vehicle!.code} - ${incident.vehicle!.name}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey[600],
                      ),
                ),
            ],
          ),
        ),
        _buildSeverityBadge(severityColor),
      ],
    );
  }

  Widget _buildSeverityBadge(Color severityColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: severityColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            IncidentStatusIcons.icons[incident.status] ?? '⚪',
            style: const TextStyle(fontSize: 12),
          ),
          const SizedBox(width: 4),
          Text(
            incident.severity,
            style: TextStyle(
              color: severityColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          incident.description ?? 'No description',
          style: Theme.of(context).textTheme.bodyMedium,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Icon(Icons.person, size: 16, color: Colors.grey[600]),
            const SizedBox(width: 4),
            Text(
              incident.officer?.name ?? 'Unknown Officer',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey[600],
                  ),
            ),
            const SizedBox(width: 16),
            Icon(Icons.access_time, size: 16, color: Colors.grey[600]),
            const SizedBox(width: 4),
            Text(
              Formatters.formatRelativeTime(incident.createdAt),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey[600],
                  ),
            ),
          ],
        ),
        if (incident.photos.isNotEmpty) ...[
          const SizedBox(height: 8),
          _buildPhotoPreview(),
        ],
      ],
    );
  }

  Widget _buildPhotoPreview() {
    return SizedBox(
      height: 60,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: incident.photos.length,
        itemBuilder: (context, index) {
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                incident.photos[index],
                width: 60,
                height: 60,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    width: 60,
                    height: 60,
                    color: Colors.grey[300],
                    child: const Icon(Icons.error, color: Colors.grey),
                  );
                },
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTimeline(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Timeline',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 8),
        ...incident.timeline.take(3).map((event) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    color: Theme.of(context).primaryColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.action,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                      Text(
                        Formatters.formatDateTime(event.timestamp),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildActions(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onTap,
            icon: const Icon(Icons.visibility, size: 16),
            label: const Text('View Details'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Theme.of(context).primaryColor,
            ),
          ),
        ),
        const SizedBox(width: 8),
        if (incident.status != 'RESOLVED')
          Expanded(
            child: ElevatedButton.icon(
              onPressed: onResolve,
              icon: const Icon(Icons.check, size: 16),
              label: const Text('Resolve'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
            ),
          ),
      ],
    );
  }

  IconData _getIncidentIcon(String type) {
    switch (type) {
      case 'PANIC_BUTTON':
        return Icons.emergency;
      case 'SPEED_VIOLATION':
        return Icons.speed;
      case 'GEOFENCE_BREACH':
        return Icons.location_off;
      case 'HARSH_BRAKING':
        return Icons.car_crash;
      case 'COLLISION':
        return Icons.compare_arrows;
      case 'THEFT_ATTEMPT':
        return Icons.security;
      case 'MECHANICAL_FAILURE':
        return Icons.build;
      case 'ROUTE_DEVIATION':
        return Icons.route;
      default:
        return Icons.warning;
    }
  }

  String _formatIncidentType(String type) {
    return type.split('_').map((word) {
      return word[0].toUpperCase() + word.substring(1).toLowerCase();
    }).join(' ');
  }
}
