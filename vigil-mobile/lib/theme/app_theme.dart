import 'package:flutter/material.dart';

class AppTheme {
  static const Color bgPrimary = Color(0xFF090D16);
  static const Color bgSecondary = Color(0xFF0F172A);
  static const Color bgCard = Color(0xFF1E293B);
  
  static const Color accentBlue = Color(0xFF3B82F6);
  static const Color statusGreen = Color(0xFF10B981);
  static const Color statusRed = Color(0xFFEF4444);
  static const Color statusAmber = Color(0xFFF59E0B);
  
  static const Color textPrimary = Color(0xFFF1F5F9);
  static const Color textSecondary = Color(0xFFCBD5E1);
  static const Color textMuted = Color(0xFF64748B);

  static ThemeData get darkTheme {
    return ThemeData.dark().copyWith(
      scaffoldBackgroundColor: bgPrimary,
      primaryColor: accentBlue,
      cardColor: bgCard,
      colorScheme: const ColorScheme.dark(
        primary: accentBlue,
        secondary: statusGreen,
        error: statusRed,
        surface: bgSecondary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgSecondary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(48, 48), // Large touch target requirement (PRD 4)
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }
}
