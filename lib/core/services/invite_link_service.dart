import 'package:flutter/foundation.dart';
import '../models/space_model.dart';
import 'space_service.dart';

class InviteLinkService {
  static String? pendingInviteCode;
  static final ValueNotifier<String?> pendingInviteNotifier = ValueNotifier<String?>(null);
  static final ValueNotifier<SpaceModel?> resolvedInviteSpace = ValueNotifier<SpaceModel?>(null);

  /// Inspect the active URL for invite / room codes across query params, fragment, and path segments
  static void initDeepLink() {
    try {
      final code = extractCodeFromUri(Uri.base);
      if (code != null && code.isNotEmpty) {
        setPendingInvite(code);
      }
    } catch (e) {
      debugPrint(">>> [InviteLinkService] Error parsing initial deep link: $e");
    }
  }

  /// Sets the pending invite code and triggers background space resolution
  static void setPendingInvite(String code) {
    final cleanCode = code.trim();
    if (cleanCode.isEmpty) return;

    pendingInviteCode = cleanCode;
    pendingInviteNotifier.value = cleanCode;
    debugPrint(">>> [InviteLinkService] Detected pending invite code: $cleanCode");

    resolvePendingSpace();
  }

  /// Resolves the space metadata for the pending invite code
  static Future<SpaceModel?> resolvePendingSpace() async {
    final code = pendingInviteCode;
    if (code == null || code.isEmpty) return null;

    try {
      final space = await SpaceService.getSpaceByCodeOrSlug(code);
      if (space != null && pendingInviteCode == code) {
        resolvedInviteSpace.value = space;
        debugPrint(">>> [InviteLinkService] Successfully resolved space: ${space.name} (${space.slug})");
      }
      return space;
    } catch (e) {
      debugPrint(">>> [InviteLinkService] Error resolving invite space for '$code': $e");
      return null;
    }
  }

  /// Clears the pending invite once consumed
  static void clearPendingInvite() {
    pendingInviteCode = null;
    pendingInviteNotifier.value = null;
    resolvedInviteSpace.value = null;
    debugPrint(">>> [InviteLinkService] Consumed and cleared pending invite code.");
  }

  /// Safely extracts an invite or space code from any Uri
  static String? extractCodeFromUri(Uri uri) {
    // 1. Direct query parameters
    final queryCode = uri.queryParameters['space'] ??
        uri.queryParameters['invite'] ??
        uri.queryParameters['code'];
    if (queryCode != null && queryCode.trim().isNotEmpty) {
      return queryCode.trim();
    }

    // 2. Query parameters inside hash fragment (e.g. /#/?space=xyz or /#/join?code=xyz)
    final fragment = uri.fragment;
    if (fragment.isNotEmpty) {
      if (fragment.contains('?') || fragment.contains('&') || fragment.contains('=')) {
        final dummyUri = Uri.tryParse('http://localhost$fragment');
        if (dummyUri != null) {
          final fragCode = dummyUri.queryParameters['space'] ??
              dummyUri.queryParameters['invite'] ??
              dummyUri.queryParameters['code'];
          if (fragCode != null && fragCode.trim().isNotEmpty) {
            return fragCode.trim();
          }
        }
      }

      // Check path segments inside fragment: e.g. #/space/my-slug or #/join/my-slug
      final fragmentPath = fragment.startsWith('/') ? fragment : '/$fragment';
      final fragUri = Uri.tryParse('http://localhost$fragmentPath');
      if (fragUri != null && fragUri.pathSegments.isNotEmpty) {
        final segments = fragUri.pathSegments;
        if (segments.length >= 2 && (segments[0] == 'space' || segments[0] == 'join')) {
          return segments[1].trim();
        }
      }
    }

    // 3. Direct path segments: /space/my-slug or /join/my-slug
    if (uri.pathSegments.isNotEmpty) {
      final segments = uri.pathSegments;
      if (segments.length >= 2 && (segments[0] == 'space' || segments[0] == 'join')) {
        return segments[1].trim();
      }
    }

    return null;
  }

  /// Extracts invite code from any user string (raw text, full URL, or partial URL)
  static String? extractCode(String rawInput) {
    final text = rawInput.trim();
    if (text.isEmpty) return null;

    try {
      if (text.contains('://') || text.startsWith('/') || text.contains('?')) {
        final uri = Uri.parse(text.startsWith('http') ? text : 'https://$text');
        final code = extractCodeFromUri(uri);
        if (code != null && code.isNotEmpty) {
          return code;
        }
      }
    } catch (_) {}

    return text;
  }

  /// Generates a standardized shareable invite URL
  static String generateInviteUrl(String spaceCode) {
    try {
      final base = Uri.base;
      if (base.scheme == 'http' || base.scheme == 'https') {
        final portSuffix = (base.port == 80 || base.port == 443 || base.port == 0) ? '' : ':${base.port}';
        final origin = '${base.scheme}://${base.host}$portSuffix';
        if (origin.isNotEmpty && origin != 'null') {
          return '$origin/?space=$spaceCode';
        }
      }
    } catch (_) {}
    return 'https://teemchat.vercel.app/?space=$spaceCode';
  }
}
