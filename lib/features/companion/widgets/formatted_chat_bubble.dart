import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/models/companion_model.dart';
import '../../../core/services/tts/tts_service.dart';

/// A rich, Neo-brutalist / Cyber message bubble supporting:
/// - Fenced code blocks with language pills & 1-tap Copy
/// - Formatted math formula cards
/// - Inline code pills with monospace font
/// - Bold, italics, and bullet lists
/// - Text-to-Speech audio playback button (🔊 Speak / ⏹ Stop)
class FormattedChatBubble extends StatefulWidget {
  final CompanionMessageModel message;
  final bool isUser;

  const FormattedChatBubble({
    super.key,
    required this.message,
    required this.isUser,
  });

  @override
  State<FormattedChatBubble> createState() => _FormattedChatBubbleState();
}

class _FormattedChatBubbleState extends State<FormattedChatBubble> {
  bool _isCopied = false;

  void _copyFullText() {
    Clipboard.setData(ClipboardData(text: widget.message.content));
    setState(() => _isCopied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _isCopied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isUser = widget.isUser;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        constraints: const BoxConstraints(maxWidth: 480),
        decoration: BoxDecoration(
          color: isUser
              ? AppColors.primary.withOpacity(0.92)
              : const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isUser
                ? AppColors.inkBlack
                : const Color(0xFF38BDF8).withOpacity(0.4),
            width: 1.6,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.35),
              offset: const Offset(2, 3),
              blurRadius: 0,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Body Content with Code & Math Parsing
            Padding(
              padding: const EdgeInsets.all(12),
              child: _MessageContentRenderer(
                content: widget.message.content,
                isUser: isUser,
              ),
            ),

            // Footer for Companion messages (TTS Speak & Copy)
            if (!isUser) ...[
              const Divider(height: 1, thickness: 1, color: Colors.white10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: const BoxDecoration(
                  color: Color(0xFF151F30),
                  borderRadius:
                      BorderRadius.vertical(bottom: Radius.circular(14)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // TTS Audio Speaker Button
                    ValueListenableBuilder<bool>(
                      valueListenable: TtsService.isSpeaking,
                      builder: (context, speaking, _) {
                        return ValueListenableBuilder<String?>(
                          valueListenable: TtsService.currentSpeakingText,
                          builder: (context, currentText, _) {
                            final isThisSpeaking = speaking &&
                                currentText == widget.message.content;

                            return InkWell(
                              onTap: () {
                                if (isThisSpeaking) {
                                  TtsService.stop();
                                } else {
                                  TtsService.speak(widget.message.content);
                                }
                              },
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: isThisSpeaking
                                      ? const Color(0xFF10B981).withOpacity(0.2)
                                      : Colors.white.withOpacity(0.06),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: isThisSpeaking
                                        ? const Color(0xFF10B981)
                                        : Colors.white12,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      isThisSpeaking
                                          ? Icons.stop_circle
                                          : Icons.volume_up,
                                      size: 14,
                                      color: isThisSpeaking
                                          ? const Color(0xFF10B981)
                                          : const Color(0xFF38BDF8),
                                    ),
                                    const SizedBox(width: 5),
                                    Text(
                                      isThisSpeaking ? "Stop" : "Speak",
                                      style: TextStyle(
                                        color: isThisSpeaking
                                            ? const Color(0xFF10B981)
                                            : Colors.white70,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    if (isThisSpeaking) ...[
                                      const SizedBox(width: 4),
                                      const _PulsingAudioDot(),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),

                    // Copy Full Message Button
                    InkWell(
                      onTap: _copyFullText,
                      borderRadius: BorderRadius.circular(6),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 4,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _isCopied ? Icons.check : Icons.copy,
                              size: 13,
                              color: _isCopied
                                  ? const Color(0xFF10B981)
                                  : Colors.white54,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _isCopied ? "Copied" : "Copy",
                              style: TextStyle(
                                color: _isCopied
                                    ? const Color(0xFF10B981)
                                    : Colors.white54,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Pulsing visual indicator when speech synthesis is active
class _PulsingAudioDot extends StatefulWidget {
  const _PulsingAudioDot();

  @override
  State<_PulsingAudioDot> createState() => _PulsingAudioDotState();
}

class _PulsingAudioDotState extends State<_PulsingAudioDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: Color(0xFF10B981),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

/// Parses message content into structured blocks (Code, Math, Text).
class _MessageContentRenderer extends StatelessWidget {
  final String content;
  final bool isUser;

  const _MessageContentRenderer({
    required this.content,
    required this.isUser,
  });

  @override
  Widget build(BuildContext context) {
    if (isUser) {
      return Text(
        content,
        style: const TextStyle(
          color: AppColors.inkBlack,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          height: 1.35,
        ),
      );
    }

    final segments = _parseContent(content);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: segments.map((seg) {
        if (seg is _CodeSegment) {
          return _CodeBlockWidget(
            language: seg.language,
            code: seg.code,
          );
        } else if (seg is _MathSegment) {
          return _MathBlockWidget(formula: seg.formula);
        } else if (seg is _TextSegment) {
          return _FormattedTextWidget(text: seg.text);
        }
        return const SizedBox.shrink();
      }).toList(),
    );
  }

  List<_Segment> _parseContent(String raw) {
    final segments = <_Segment>[];
    final codeRegex = RegExp(r'```([a-zA-Z0-9_-]*)\n([\s\S]*?)```');
    final mathRegex = RegExp(r'\$\$([\s\S]*?)\$\$');

    var currentIndex = 0;

    // Scan for code blocks and math blocks sequentially
    while (currentIndex < raw.length) {
      final codeMatch = codeRegex.firstMatch(raw.substring(currentIndex));
      final mathMatch = mathRegex.firstMatch(raw.substring(currentIndex));

      int? nextMatchStart;
      bool isCode = false;
      RegExpMatch? selectedMatch;

      if (codeMatch != null && mathMatch != null) {
        if (codeMatch.start <= mathMatch.start) {
          nextMatchStart = codeMatch.start;
          isCode = true;
          selectedMatch = codeMatch;
        } else {
          nextMatchStart = mathMatch.start;
          isCode = false;
          selectedMatch = mathMatch;
        }
      } else if (codeMatch != null) {
        nextMatchStart = codeMatch.start;
        isCode = true;
        selectedMatch = codeMatch;
      } else if (mathMatch != null) {
        nextMatchStart = mathMatch.start;
        isCode = false;
        selectedMatch = mathMatch;
      }

      if (selectedMatch != null && nextMatchStart != null) {
        // Preceding text segment
        if (nextMatchStart > 0) {
          final text =
              raw.substring(currentIndex, currentIndex + nextMatchStart);
          if (text.trim().isNotEmpty) {
            segments.add(_TextSegment(text));
          }
        }

        if (isCode) {
          final lang = selectedMatch.group(1)?.trim() ?? '';
          final code = selectedMatch.group(2)?.trimRight() ?? '';
          segments.add(_CodeSegment(
            language: lang.isEmpty ? 'code' : lang,
            code: code,
          ));
        } else {
          final formula = selectedMatch.group(1)?.trim() ?? '';
          segments.add(_MathSegment(formula));
        }

        currentIndex += selectedMatch.end;
      } else {
        // Remaining trailing text
        final remaining = raw.substring(currentIndex);
        if (remaining.trim().isNotEmpty) {
          segments.add(_TextSegment(remaining));
        }
        break;
      }
    }

    if (segments.isEmpty && raw.trim().isNotEmpty) {
      segments.add(_TextSegment(raw));
    }

    return segments;
  }
}

abstract class _Segment {}

class _TextSegment extends _Segment {
  final String text;
  _TextSegment(this.text);
}

class _CodeSegment extends _Segment {
  final String language;
  final String code;
  _CodeSegment({required this.language, required this.code});
}

class _MathSegment extends _Segment {
  final String formula;
  _MathSegment(this.formula);
}

/// Renders a dedicated syntax-styled code block with language pill and copy button
class _CodeBlockWidget extends StatefulWidget {
  final String language;
  final String code;

  const _CodeBlockWidget({
    required this.language,
    required this.code,
  });

  @override
  State<_CodeBlockWidget> createState() => _CodeBlockWidgetState();
}

class _CodeBlockWidgetState extends State<_CodeBlockWidget> {
  bool _copied = false;

  void _copy() {
    Clipboard.setData(ClipboardData(text: widget.code));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF090D16),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFF38BDF8).withOpacity(0.3),
          width: 1.2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: const BoxDecoration(
              color: Color(0xFF162032),
              borderRadius: BorderRadius.vertical(top: Radius.circular(9)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFF38BDF8).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: const Color(0xFF38BDF8),
                      width: 0.8,
                    ),
                  ),
                  child: Text(
                    widget.language.toUpperCase(),
                    style: GoogleFonts.jetBrainsMono(
                      color: const Color(0xFF38BDF8),
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                InkWell(
                  onTap: _copy,
                  borderRadius: BorderRadius.circular(4),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    child: Row(
                      children: [
                        Icon(
                          _copied ? Icons.check : Icons.copy,
                          size: 12,
                          color: _copied
                              ? const Color(0xFF10B981)
                              : Colors.white60,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _copied ? "Copied!" : "Copy",
                          style: TextStyle(
                            color: _copied
                                ? const Color(0xFF10B981)
                                : Colors.white70,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Code Text Area with Horizontal Scrolling
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: Text(
              widget.code,
              style: GoogleFonts.jetBrainsMono(
                color: const Color(0xFFE2E8F0),
                fontSize: 12,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Renders a dedicated math formula block
class _MathBlockWidget extends StatelessWidget {
  final String formula;

  const _MathBlockWidget({required this.formula});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF061826),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFF10B981).withOpacity(0.4),
          width: 1.2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Text("📐", style: TextStyle(fontSize: 12)),
              const SizedBox(width: 6),
              Text(
                "FORMULA",
                style: GoogleFonts.jetBrainsMono(
                  color: const Color(0xFF10B981),
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Text(
              formula,
              style: GoogleFonts.firaCode(
                color: const Color(0xFF6EE7B7),
                fontSize: 13,
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Renders paragraph text with inline formatting (code, bold, bullet points)
class _FormattedTextWidget extends StatelessWidget {
  final String text;

  const _FormattedTextWidget({required this.text});

  @override
  Widget build(BuildContext context) {
    final lines = text.split('\n');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: lines.map((line) {
        if (line.trim().isEmpty) {
          return const SizedBox(height: 6);
        }

        // Check if line is a bullet item
        final isBullet = line.trimLeft().startsWith('- ') ||
            line.trimLeft().startsWith('* ') ||
            line.trimLeft().startsWith('• ');

        final lineText = isBullet
            ? line.trimLeft().replaceFirst(RegExp(r'^[-*•]\s*'), '')
            : line;

        final spans = <InlineSpan>[];
        if (isBullet) {
          spans.add(const TextSpan(
            text: "• ",
            style: TextStyle(
              color: Color(0xFF38BDF8),
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ));
        }

        spans.addAll(_parseInlineSpans(lineText));

        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text.rich(
            TextSpan(children: spans),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              height: 1.35,
            ),
          ),
        );
      }).toList(),
    );
  }

  List<InlineSpan> _parseInlineSpans(String line) {
    final spans = <InlineSpan>[];
    // Matches inline code: `code` or bold: **bold** or inline math: $formula$
    final pattern = RegExp(r'(`[^`]+`|\*\*[^*]+\*\*|\$[^\$]+\$)');

    var current = 0;
    for (final match in pattern.allMatches(line)) {
      if (match.start > current) {
        spans.add(TextSpan(text: line.substring(current, match.start)));
      }

      final matched = match.group(0)!;
      if (matched.startsWith('`') && matched.endsWith('`')) {
        final code = matched.substring(1, matched.length - 1);
        spans.add(TextSpan(
          text: " $code ",
          style: GoogleFonts.jetBrainsMono(
            color: const Color(0xFF38BDF8),
            backgroundColor: const Color(0xFF0F172A),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ));
      } else if (matched.startsWith(r'$') && matched.endsWith(r'$')) {
        final math = matched.substring(1, matched.length - 1);
        spans.add(TextSpan(
          text: " $math ",
          style: GoogleFonts.firaCode(
            color: const Color(0xFF6EE7B7),
            backgroundColor: const Color(0xFF061826),
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            fontStyle: FontStyle.italic,
          ),
        ));
      } else if (matched.startsWith('**') && matched.endsWith('**')) {
        final bold = matched.substring(2, matched.length - 2);
        spans.add(TextSpan(
          text: bold,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ));
      }

      current = match.end;
    }

    if (current < line.length) {
      spans.add(TextSpan(text: line.substring(current)));
    }

    return spans;
  }
}
