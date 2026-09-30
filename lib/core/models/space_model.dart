import 'package:flutter/material.dart';

enum SpaceTier {
  free,
  pro,
  studio;

  static SpaceTier fromString(String value) {
    switch (value.toLowerCase()) {
      case 'pro':
        return SpaceTier.pro;
      case 'studio':
        return SpaceTier.studio;
      case 'free':
      default:
        return SpaceTier.free;
    }
  }

  String get id {
    switch (this) {
      case SpaceTier.pro:
        return 'pro';
      case SpaceTier.studio:
        return 'studio';
      case SpaceTier.free:
        return 'free';
    }
  }

  String get displayName {
    switch (this) {
      case SpaceTier.pro:
        return 'Pro Builder';
      case SpaceTier.studio:
        return 'Studio';
      case SpaceTier.free:
        return 'Starter';
    }
  }

  String get badgeText {
    switch (this) {
      case SpaceTier.pro:
        return 'PRO BUILDER';
      case SpaceTier.studio:
        return 'STUDIO';
      case SpaceTier.free:
        return 'FREE FOREVER';
    }
  }

  Color get badgeColor {
    switch (this) {
      case SpaceTier.pro:
        return const Color(0xFFFBBF24); // Amber
      case SpaceTier.studio:
        return const Color(0xFF38BDF8); // Cyan/Sky
      case SpaceTier.free:
        return const Color(0xFF10B981); // Emerald
    }
  }

  int get defaultCapacity {
    switch (this) {
      case SpaceTier.pro:
        return 75;
      case SpaceTier.studio:
        return 250;
      case SpaceTier.free:
        return 15;
    }
  }

  bool get allowsCloudMapPersistence => this != SpaceTier.free;
  bool get allowsCustomUploads => this == SpaceTier.studio;
}

class SpaceModel {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String category;
  final String visibility;
  final SpaceTier tier;
  final String mapTheme;
  final String? joinCode;
  final String? ownerId;
  final int maxCapacity;
  final int memberCount;
  final int paletteIndex;
  final bool isActive;
  final bool isTemporary;
  final DateTime? createdAt;

  const SpaceModel({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.category = 'Gaming',
    this.visibility = 'public',
    this.tier = SpaceTier.free,
    this.mapTheme = 'village',
    this.joinCode,
    this.ownerId,
    this.maxCapacity = 15,
    this.memberCount = 1,
    this.paletteIndex = 0,
    this.isActive = true,
    this.isTemporary = false,
    this.createdAt,
  });

  bool get isPaid => tier != SpaceTier.free;
  bool get isPro => tier == SpaceTier.pro;
  bool get isStudio => tier == SpaceTier.studio;
  bool get canCustomizeMap => tier.allowsCloudMapPersistence;

  factory SpaceModel.defaultHQ() {
    return const SpaceModel(
      id: 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b',
      name: 'Main Headquarters',
      slug: 'main-hq',
      description: 'Persistent virtual realm with Village, Woods, Campfire & Coastal Bay',
      category: 'Gaming',
      visibility: 'public',
      tier: SpaceTier.free,
      mapTheme: 'village',
      maxCapacity: 15,
      memberCount: 1,
    );
  }

  factory SpaceModel.guestSandbox({String? guestId}) {
    final suffix = guestId != null ? guestId.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '') : 'temp';
    return SpaceModel(
      id: 'guest-sandbox-$suffix',
      name: 'Guest Playground',
      slug: 'guest-playground',
      description: 'Unique personal sandbox for guest visitors — walk, explore and build freely',
      category: 'Explore',
      visibility: 'unlisted',
      tier: SpaceTier.free,
      mapTheme: 'village',
      maxCapacity: 10,
      memberCount: 1,
      isTemporary: true,
    );
  }

  factory SpaceModel.fromJson(Map<String, dynamic> json) {
    final tierStr = (json['tier'] as String?) ?? 'free';
    final tier = SpaceTier.fromString(tierStr);
    final id = json['id'] as String? ?? '';

    return SpaceModel(
      id: id,
      name: json['name'] as String? ?? 'Unnamed Space',
      slug: json['slug'] as String? ?? 'space',
      description: json['description'] as String?,
      category: json['category'] as String? ?? 'Gaming',
      visibility: json['visibility'] as String? ?? 'public',
      tier: tier,
      mapTheme: (json['map_theme'] as String?) ?? 'village',
      joinCode: json['join_code'] as String?,
      ownerId: json['owner_id'] as String?,
      maxCapacity: (json['max_capacity'] as num?)?.toInt() ?? tier.defaultCapacity,
      memberCount: (json['member_count'] as num?)?.toInt() ?? 1,
      paletteIndex: (json['palette_index'] as num?)?.toInt() ?? 0,
      isActive: json['is_active'] as bool? ?? true,
      isTemporary: json['is_temporary'] as bool? ?? (id.startsWith('guest-') || id.startsWith('temp-')),
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'category': category,
      'visibility': visibility,
      'tier': tier.id,
      'map_theme': mapTheme,
      'join_code': joinCode,
      'owner_id': ownerId,
      'max_capacity': maxCapacity,
      'member_count': memberCount,
      'palette_index': paletteIndex,
      'is_active': isActive,
      'is_temporary': isTemporary,
    };
  }

  SpaceModel copyWith({
    String? id,
    String? name,
    String? slug,
    String? description,
    String? category,
    String? visibility,
    SpaceTier? tier,
    String? mapTheme,
    String? joinCode,
    String? ownerId,
    int? maxCapacity,
    int? memberCount,
    int? paletteIndex,
    bool? isActive,
    bool? isTemporary,
    DateTime? createdAt,
  }) {
    return SpaceModel(
      id: id ?? this.id,
      name: name ?? this.name,
      slug: slug ?? this.slug,
      description: description ?? this.description,
      category: category ?? this.category,
      visibility: visibility ?? this.visibility,
      tier: tier ?? this.tier,
      mapTheme: mapTheme ?? this.mapTheme,
      joinCode: joinCode ?? this.joinCode,
      ownerId: ownerId ?? this.ownerId,
      maxCapacity: maxCapacity ?? this.maxCapacity,
      memberCount: memberCount ?? this.memberCount,
      paletteIndex: paletteIndex ?? this.paletteIndex,
      isActive: isActive ?? this.isActive,
      isTemporary: isTemporary ?? this.isTemporary,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

class WorldObjectModel {
  final String id;
  final String spaceId;
  final String objectType;
  final double x;
  final double y;
  final int rotation;
  final Map<String, dynamic> properties;
  final String? placedBy;

  const WorldObjectModel({
    required this.id,
    required this.spaceId,
    required this.objectType,
    required this.x,
    required this.y,
    this.rotation = 0,
    this.properties = const {},
    this.placedBy,
  });

  factory WorldObjectModel.fromJson(Map<String, dynamic> json) {
    return WorldObjectModel(
      id: json['id'] as String? ?? '',
      spaceId: json['space_id'] as String? ?? '',
      objectType: json['object_type'] as String? ?? 'campfire',
      x: (json['x'] as num?)?.toDouble() ?? 0.0,
      y: (json['y'] as num?)?.toDouble() ?? 0.0,
      rotation: (json['rotation'] as num?)?.toInt() ?? 0,
      properties: (json['properties'] as Map<String, dynamic>?) ?? const {},
      placedBy: json['placed_by'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id.isNotEmpty) 'id': id,
      'space_id': spaceId,
      'object_type': objectType,
      'x': x,
      'y': y,
      'rotation': rotation,
      'properties': properties,
      if (placedBy != null) 'placed_by': placedBy,
    };
  }
}
