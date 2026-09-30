enum DetailLevel {
  concise,
  balanced,
  detailed,
}

class CompanionModel {
  final String id;
  final String userId;
  final String name;
  final String persona;
  final String companionType;
  final String avatarStyle;
  final Map<String, dynamic> learnedContext;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  CompanionModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.persona,
    this.companionType = 'robot',
    this.avatarStyle = 'bot_blue',
    this.learnedContext = const {},
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
  });

  DetailLevel get detailLevel {
    final val = learnedContext['detail_level'] as String?;
    switch (val) {
      case 'concise':
        return DetailLevel.concise;
      case 'detailed':
        return DetailLevel.detailed;
      case 'balanced':
      default:
        return DetailLevel.balanced;
    }
  }


  factory CompanionModel.fromJson(Map<String, dynamic> json) {
    return CompanionModel(
      id: json['id'] as String? ?? '',
      userId: json['user_id'] as String? ?? '',
      name: json['name'] as String? ?? 'Pixel Companion',
      persona: json['persona'] as String? ??
          'A friendly, insightful AI companion who travels the virtual world with you and learns your style.',
      companionType: json['companion_type'] as String? ?? 'robot',
      avatarStyle: json['avatar_style'] as String? ?? 'bot_blue',
      learnedContext: json['learned_context'] is Map<String, dynamic>
          ? json['learned_context'] as Map<String, dynamic>
          : <String, dynamic>{},
      isActive: json['is_active'] as bool? ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  static bool isValidUuid(String? str) {
    if (str == null || str.length != 36) return false;
    final uuidRegex = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    );
    return uuidRegex.hasMatch(str);
  }

  Map<String, dynamic> toJson({bool includeId = true}) {
    return {
      if (includeId && isValidUuid(id)) 'id': id,
      'user_id': userId,
      'name': name,
      'persona': persona,
      'companion_type': companionType,
      'avatar_style': avatarStyle,
      'learned_context': learnedContext,
      'is_active': isActive,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    };
  }

  CompanionModel copyWith({
    String? name,
    String? persona,
    String? companionType,
    String? avatarStyle,
    Map<String, dynamic>? learnedContext,
    bool? isActive,
  }) {
    return CompanionModel(
      id: id,
      userId: userId,
      name: name ?? this.name,
      persona: persona ?? this.persona,
      companionType: companionType ?? this.companionType,
      avatarStyle: avatarStyle ?? this.avatarStyle,
      learnedContext: learnedContext ?? this.learnedContext,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }
}

class CompanionMemoryModel {
  final String id;
  final String companionId;
  final String userId;
  final String key;
  final String value;
  final String category;
  final DateTime createdAt;

  CompanionMemoryModel({
    required this.id,
    required this.companionId,
    required this.userId,
    required this.key,
    required this.value,
    this.category = 'general',
    required this.createdAt,
  });

  factory CompanionMemoryModel.fromJson(Map<String, dynamic> json) {
    return CompanionMemoryModel(
      id: json['id'] as String? ?? '',
      companionId: json['companion_id'] as String? ?? '',
      userId: json['user_id'] as String? ?? '',
      key: json['memory_key'] as String? ?? '',
      value: json['memory_value'] as String? ?? '',
      category: json['category'] as String? ?? 'general',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class CompanionMessageModel {
  final String id;
  final String companionId;
  final String userId;
  final String role; // 'user' or 'assistant'
  final String content;
  final DateTime createdAt;

  CompanionMessageModel({
    required this.id,
    required this.companionId,
    required this.userId,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  bool get isAi => role == 'assistant';

  factory CompanionMessageModel.fromJson(Map<String, dynamic> json) {
    return CompanionMessageModel(
      id: json['id'] as String? ?? '',
      companionId: json['companion_id'] as String? ?? '',
      userId: json['user_id'] as String? ?? '',
      role: json['role'] as String? ?? 'user',
      content: json['content'] as String? ?? '',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
