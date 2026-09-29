import 'package:flutter/material.dart';

class AvatarConfig {
  static const List<String> availableHairStyles = [
    'short',
    'long',
    'buzz',
    'spiky',
  ];

  static const List<String> availableAccessories = [
    'none',
    'glasses',
    'headband',
    'headphones',
    'cap',
  ];

  final Color skinColor;
  final Color shirtColor;
  final Color hairColor;
  final String hairStyle; 
  final String accessory; 

  const AvatarConfig({
    this.skinColor = const Color(0xFFFCD5B5),
    this.shirtColor = const Color(0xFF7C3AED),
    this.hairColor = const Color(0xFF37271E),
    this.hairStyle = 'short',
    this.accessory = 'none',
  });

  AvatarConfig copyWith({
    Color? skinColor,
    Color? shirtColor,
    Color? hairColor,
    String? hairStyle,
    String? accessory,
  }) {
    return AvatarConfig(
      skinColor: skinColor ?? this.skinColor,
      shirtColor: shirtColor ?? this.shirtColor,
      hairColor: hairColor ?? this.hairColor,
      hairStyle: hairStyle ?? this.hairStyle,
      accessory: accessory ?? this.accessory,
    );
  }

  factory AvatarConfig.fromJson(Map<String, dynamic> json) {
    Color parseHex(String? hex, Color fallback) {
      if (hex == null || hex.isEmpty) return fallback;
      try {
        final clean = hex.replaceAll('#', '');
        return Color(int.parse(clean.length == 6 ? '0xFF$clean' : '0x$clean'));
      } catch (_) {
        return fallback;
      }
    }

    return AvatarConfig(
      skinColor: parseHex(json['skinColor']?.toString(), const Color(0xFFFCD5B5)),
      shirtColor: parseHex(json['shirtColor']?.toString(), const Color(0xFF7C3AED)),
      hairColor: parseHex(json['hairColor']?.toString(), const Color(0xFF37271E)),
      hairStyle: json['hairStyle']?.toString() ?? 'short',
      accessory: json['accessory']?.toString() ?? 'none',
    );
  }

  Map<String, dynamic> toJson() => {
    'skinColor': '#${skinColor.value.toRadixString(16).padLeft(8, '0').substring(2)}',
    'shirtColor': '#${shirtColor.value.toRadixString(16).padLeft(8, '0').substring(2)}',
    'hairColor': '#${hairColor.value.toRadixString(16).padLeft(8, '0').substring(2)}',
    'hairStyle': hairStyle,
    'accessory': accessory,
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AvatarConfig &&
          runtimeType == other.runtimeType &&
          skinColor == other.skinColor &&
          shirtColor == other.shirtColor &&
          hairColor == other.hairColor &&
          hairStyle == other.hairStyle &&
          accessory == other.accessory;

  @override
  int get hashCode =>
      skinColor.hashCode ^
      shirtColor.hashCode ^
      hairColor.hashCode ^
      hairStyle.hashCode ^
      accessory.hashCode;

  @override
  String toString() =>
      'AvatarConfig(hairStyle: $hairStyle, accessory: $accessory, skin: ${skinColor.value.toRadixString(16)}, shirt: ${shirtColor.value.toRadixString(16)}, hair: ${hairColor.value.toRadixString(16)})';
}
