class DateHelper {
  static bool isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year &&
           date.month == now.month &&
           date.day == now.day;
  }

  static bool isYesterday(DateTime date) {
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    return date.year == yesterday.year &&
           date.month == yesterday.month &&
           date.day == yesterday.day;
  }

  static bool isThisWeek(DateTime date) {
    final now = DateTime.now();
    final startOfWeek = now.subtract(Duration(days: now.weekday - 1));
    final endOfWeek = startOfWeek.add(const Duration(days: 7));
    
    return date.isAfter(startOfWeek) && date.isBefore(endOfWeek);
  }

  static bool isThisMonth(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month;
  }

  static bool isThisYear(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year;
  }

  static bool isOlderThan(Duration duration, DateTime date) {
    return DateTime.now().difference(date) > duration;
  }

  static bool isWithinLast(Duration duration, DateTime date) {
    return DateTime.now().difference(date) <= duration;
  }

  static bool isBetween(DateTime start, DateTime end, DateTime date) {
    return date.isAfter(start) && date.isBefore(end);
  }

  static bool isExpired(DateTime expiryDate) {
    return DateTime.now().isAfter(expiryDate);
  }

  static bool isExpiringSoon(DateTime expiryDate, {Duration within = const Duration(days: 7)}) {
    final now = DateTime.now();
    final difference = expiryDate.difference(now);
    return difference.isNegative == false && difference <= within;
  }

  static int daysUntil(DateTime date) {
    return date.difference(DateTime.now()).inDays;
  }

  static int daysSince(DateTime date) {
    return DateTime.now().difference(date).inDays;
  }

  static DateTime startOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day);
  }

  static DateTime endOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day, 23, 59, 59);
  }

  static DateTime startOfWeek(DateTime date) {
    return date.subtract(Duration(days: date.weekday - 1));
  }

  static DateTime endOfWeek(DateTime date) {
    return startOfWeek(date).add(const Duration(days: 7));
  }

  static DateTime startOfMonth(DateTime date) {
    return DateTime(date.year, date.month);
  }

  static DateTime endOfMonth(DateTime date) {
    return DateTime(date.year, date.month + 1, 0);
  }

  static List<DateTime> getDaysInMonth(DateTime date) {
    final start = startOfMonth(date);
    final end = endOfMonth(date);
    final days = <DateTime>[];
    
    for (var i = 0; i <= end.day - start.day; i++) {
      days.add(start.add(Duration(days: i)));
    }
    
    return days;
  }

  static List<DateTime> getWeeksInMonth(DateTime date) {
    final start = startOfMonth(date);
    final end = endOfMonth(date);
    final weeks = <DateTime>[];
    
    var current = start;
    while (current.isBefore(end)) {
      weeks.add(current);
      current = current.add(const Duration(days: 7));
    }
    
    return weeks;
  }

  static String getGreeting() {
    final hour = DateTime.now().hour;
    
    if (hour < 12) {
      return 'Good Morning';
    } else if (hour < 17) {
      return 'Good Afternoon';
    } else {
      return 'Good Evening';
    }
  }

  static String getTimeOfDay() {
    final hour = DateTime.now().hour;
    
    if (hour >= 5 && hour < 12) {
      return 'Morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'Evening';
    } else {
      return 'Night';
    }
  }

  static bool isBusinessHours({int startHour = 9, int endHour = 17}) {
    final hour = DateTime.now().hour;
    return hour >= startHour && hour < endHour;
  }

  static bool isWeekend() {
    final weekday = DateTime.now().weekday;
    return weekday == 6 || weekday == 7;
  }

  static bool isWeekday() {
    return !isWeekend();
  }
}
