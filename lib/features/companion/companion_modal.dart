import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/models/companion_model.dart';
import '../../core/services/companion_service.dart';
import '../../core/services/subscription_service.dart';
import '../../core/services/tts/tts_service.dart';
import '../subscription/widgets/upgrade_modal.dart';
import 'widgets/formatted_chat_bubble.dart';

class CompanionModal extends StatefulWidget {
  final String userName;
  final String currentZone;
  final VoidCallback onDismiss;

  const CompanionModal({
    super.key,
    required this.userName,
    required this.currentZone,
    required this.onDismiss,
  });

  @override
  State<CompanionModal> createState() => _CompanionModalState();
}

class _CompanionModalState extends State<CompanionModal>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  // Persona editing controllers
  late final TextEditingController _nameController;
  late final TextEditingController _personaController;
  String _selectedType = 'robot';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_handleTabChanged);
    CompanionService.messages.addListener(_handleMessagesChanged);
    SubscriptionService.initialize();

    final current = CompanionService.currentCompanion.value;
    _nameController =
        TextEditingController(text: current?.name ?? 'Pixel Companion');
    _personaController = TextEditingController(
      text: current?.persona ??
          'A friendly, insightful AI companion who travels the virtual world with you and learns your style.',
    );
    _selectedType = current?.companionType ?? 'robot';

    // Auto-scroll to the latest message as soon as the modal opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom(animate: false);
    });
  }

  void _handleTabChanged() {
    if (_tabController.index == 0) {
      // Whenever the user returns to the Chat tab, auto-scroll to latest
      _scrollToBottom(animate: false);
    }
  }

  void _handleMessagesChanged() {
    // Whenever a new message (user or AI reply) arrives, scroll to latest
    _scrollToBottom(animate: true);
  }

  void _scrollToBottom({bool animate = true}) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        final maxOffset = _scrollController.position.maxScrollExtent;
        if (animate) {
          _scrollController.animateTo(
            maxOffset,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          );
        } else {
          _scrollController.jumpTo(maxOffset);
        }
      }
    });
  }

  @override
  void dispose() {
    _tabController.removeListener(_handleTabChanged);
    CompanionService.messages.removeListener(_handleMessagesChanged);
    _tabController.dispose();
    _inputController.dispose();
    _nameController.dispose();
    _personaController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage([String? quickText]) async {
    final text = quickText ?? _inputController.text.trim();
    if (text.isEmpty) return;

    if (!SubscriptionService.isUnlimited &&
        CompanionService.remainingDailyMessages.value <= 0) {
      UpgradeModal.show(context);
      return;
    }

    _inputController.clear();

    // Sends with null detailLevel so GeminiService autonomously adapts
    // (concise vs balanced vs in-depth explanation) to query complexity
    await CompanionService.sendMessage(
      userText: text,
      currentZone: widget.currentZone,
      userName: widget.userName,
    );

    _scrollToBottom(animate: true);
  }

  void _savePersonaSettings() async {
    final name = _nameController.text.trim();
    final persona = _personaController.text.trim();
    if (name.isEmpty) return;

    final saved = await CompanionService.updateCompanion(
      name: name,
      persona: persona,
      companionType: _selectedType,
      avatarStyle: _selectedType == 'robot' ? 'bot_blue' : 'default',
      detailLevel: DetailLevel.balanced,
    );

    if (mounted) {
      if (saved != null) {
        setState(() {
          _nameController.text = saved.name;
          _personaController.text = saved.persona;
          _selectedType = saved.companionType;
        });
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "${saved?.name ?? 'AI Companion'} saved! Form: $_selectedType",
          ),
          backgroundColor: AppColors.primary,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620, maxHeight: 720),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.primary, width: 2.5),
            boxShadow: const [
              BoxShadow(
                color: Colors.black87,
                offset: Offset(6, 6),
                blurRadius: 0,
              ),
            ],
          ),
          child: Column(
            children: [
              // Header
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                decoration: const BoxDecoration(
                  color: Color(0xFF1E293B),
                  borderRadius:
                      BorderRadius.vertical(top: Radius.circular(18)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.primary),
                      ),
                      child: const Text("🤖", style: TextStyle(fontSize: 20)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ValueListenableBuilder<CompanionModel?>(
                        valueListenable: CompanionService.currentCompanion,
                        builder: (context, comp, _) {
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    comp?.name ?? "Pixel Companion",
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF06B6D4),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      "AI AGENT",
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              Text(
                                "Exploring ${widget.currentZone} with you",
                                style: const TextStyle(
                                  color: Colors.white60,
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70),
                      onPressed: () {
                        TtsService.stop();
                        Navigator.of(context).pop();
                      },
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, thickness: 1, color: Colors.white10),

              // Tab Bar
              TabBar(
                controller: _tabController,
                indicatorColor: AppColors.primary,
                indicatorWeight: 3,
                labelColor: AppColors.primary,
                unselectedLabelColor: Colors.white60,
                labelStyle: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
                tabs: const [
                  Tab(
                    icon: Icon(Icons.chat_bubble_outline, size: 18),
                    text: "Chat",
                  ),
                  Tab(
                    icon: Icon(Icons.psychology, size: 18),
                    text: "Learned Memory",
                  ),
                  Tab(
                    icon: Icon(Icons.tune, size: 18),
                    text: "Persona & Style",
                  ),
                ],
              ),

              // Tab Views
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildChatTab(),
                    _buildMemoryTab(),
                    _buildPersonaTab(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── TAB 1: CHAT ──────────────────────────────────────────────
  Widget _buildChatTab() {
    return Column(
      children: [
        // Quick Settings Toolbar (Detail Level & Auto-Voice)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0xFF141E30),
            border: Border(bottom: BorderSide(color: Colors.white10)),
          ),
          child: Row(
            children: [
              // Auto-Adaptive AI status indicator
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.primary.withOpacity(0.35),
                    ),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text("✨", style: TextStyle(fontSize: 12)),
                      SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          "Auto-Adaptive AI",
                          style: TextStyle(
                            color: AppColors.primary,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      SizedBox(width: 6),
                      Text(
                        "• Auto Depth & Tokens",
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Auto-Voice Audio Toggle
              ValueListenableBuilder<bool>(
                valueListenable: TtsService.autoSpeak,
                builder: (context, autoSpeak, _) {
                  return InkWell(
                    onTap: () {
                      TtsService.autoSpeak.value = !autoSpeak;
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: autoSpeak
                            ? const Color(0xFF10B981).withOpacity(0.2)
                            : Colors.white.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: autoSpeak
                              ? const Color(0xFF10B981)
                              : Colors.white12,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            autoSpeak ? Icons.volume_up : Icons.volume_off,
                            size: 14,
                            color: autoSpeak
                                ? const Color(0xFF10B981)
                                : Colors.white54,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            autoSpeak ? "Voice ON" : "Voice OFF",
                            style: TextStyle(
                              color: autoSpeak
                                  ? const Color(0xFF10B981)
                                  : Colors.white54,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(width: 8),
              // Quota Tracker or Unlimited Pro Badge
              ValueListenableBuilder<UserSubscriptionModel>(
                valueListenable: SubscriptionService.subscription,
                builder: (context, sub, _) {
                  final isUnlimited = sub.isActive && sub.hasAiUnlimited;
                  if (isUnlimited) {
                    return GestureDetector(
                      onTap: () => UpgradeModal.show(context),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: const Color(0xFF10B981),
                            width: 1.2,
                          ),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text("⚡", style: TextStyle(fontSize: 11)),
                            SizedBox(width: 4),
                            Text(
                              "UNLIMITED",
                              style: TextStyle(
                                color: Color(0xFF6EE7B7),
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return ValueListenableBuilder<int>(
                    valueListenable: CompanionService.remainingDailyMessages,
                    builder: (context, remaining, _) {
                      final limit = CompanionService.maxDailyMessages.value;
                      final isExhausted = remaining <= 0;
                      return GestureDetector(
                        onTap: () => UpgradeModal.show(context),
                        child: Tooltip(
                          message: isExhausted
                              ? "Daily quota exhausted ($limit/$limit used). Resets at midnight UTC. Click to upgrade!"
                              : "$remaining of $limit companion messages remaining today. Click to upgrade to Unlimited!",
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: isExhausted
                                  ? const Color(0xFFEF4444).withOpacity(0.18)
                                  : const Color(0xFF10B981).withOpacity(0.18),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isExhausted
                                    ? const Color(0xFFEF4444).withOpacity(0.6)
                                    : const Color(0xFF10B981).withOpacity(0.6),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  isExhausted ? "⚠️" : "⚡",
                                  style: const TextStyle(fontSize: 10),
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  "$remaining/$limit",
                                  style: TextStyle(
                                    color: isExhausted
                                        ? const Color(0xFFFCA5A5)
                                        : const Color(0xFF6EE7B7),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                    vertical: 1.5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.accent,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    "PRO",
                                    style: TextStyle(
                                      color: Colors.black,
                                      fontSize: 8.5,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ],
          ),
        ),

        // Message list wrapped in SelectionArea
        Expanded(
          child: SelectionArea(
            child: ValueListenableBuilder<List<CompanionMessageModel>>(
              valueListenable: CompanionService.messages,
              builder: (context, msgs, _) {
                if (msgs.isEmpty) {
                  return Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text("✨", style: TextStyle(fontSize: 36)),
                          const SizedBox(height: 10),
                          const Text(
                            "Your companion is ready to learn!",
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            "Chat with your companion about the world, code, math formulas, or your personal preferences.",
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white54,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            alignment: WrapAlignment.center,
                            children: [
                              _buildQuickChip("Where are we right now?"),
                              _buildQuickChip("Show me a quick Python snippet!"),
                              _buildQuickChip("What have you learned about me?"),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  itemCount: msgs.length,
                  itemBuilder: (context, index) {
                    final msg = msgs[index];
                    final isUser = msg.role == 'user';
                    return FormattedChatBubble(
                      message: msg,
                      isUser: isUser,
                    );
                  },
                );
              },
            ),
          ),
        ),

        // Thinking indicator
        ValueListenableBuilder<bool>(
          valueListenable: CompanionService.isThinking,
          builder: (context, thinking, _) {
            if (!thinking) return const SizedBox.shrink();
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              alignment: Alignment.centerLeft,
              child: const Row(
                children: [
                  SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Color(0xFF38BDF8),
                    ),
                  ),
                  SizedBox(width: 8),
                  Text(
                    "Companion is thinking...",
                    style: TextStyle(color: Colors.white54, fontSize: 11),
                  ),
                ],
              ),
            );
          },
        ),

        // Input bar
        ValueListenableBuilder<int>(
          valueListenable: CompanionService.remainingDailyMessages,
          builder: (context, remaining, _) {
            final isExhausted = remaining <= 0;
            return Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: Color(0xFF1E293B),
                border: Border(top: BorderSide(color: Colors.white12)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: isExhausted
                            ? const Color(0xFF1E1E24)
                            : const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isExhausted
                              ? Colors.redAccent.withOpacity(0.4)
                              : Colors.white24,
                        ),
                      ),
                      child: TextField(
                        controller: _inputController,
                        enabled: !isExhausted,
                        onSubmitted: (_) => _sendMessage(),
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        decoration: InputDecoration(
                          hintText: isExhausted
                              ? "Daily limit reached (50/50). Resets at midnight UTC..."
                              : "Talk to your companion...",
                          hintStyle: TextStyle(
                            color: isExhausted
                                ? Colors.redAccent.withOpacity(0.7)
                                : Colors.white38,
                            fontSize: 12.5,
                          ),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: isExhausted ? Colors.white24 : AppColors.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: IconButton(
                      icon: Icon(
                        isExhausted ? Icons.lock_clock : Icons.send,
                        color: isExhausted ? Colors.white54 : AppColors.inkBlack,
                        size: 18,
                      ),
                      onPressed: isExhausted
                          ? () => UpgradeModal.show(context)
                          : _sendMessage,
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }


  Widget _buildQuickChip(String label) {
    return ActionChip(
      label: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 11.5),
      ),
      backgroundColor: const Color(0xFF1E293B),
      side: const BorderSide(color: Colors.white24),
      onPressed: () => _sendMessage(label),
    );
  }

  // ── TAB 2: LEARNED MEMORY ─────────────────────────────────────
  Widget _buildMemoryTab() {
    return AnimatedBuilder(
      animation: Listenable.merge([
        CompanionService.currentCompanion,
        CompanionService.memories,
      ]),
      builder: (context, _) {
        final comp = CompanionService.currentCompanion.value;
        final facts = Map<String, dynamic>.from(comp?.learnedContext ?? {});
        for (final m in CompanionService.memories.value) {
          facts[m.key] = m.value;
        }

        return Padding(
          padding: const EdgeInsets.all(18.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    "LEARNED USER PROFILE",
                    style: TextStyle(
                      color: Color(0xFF38BDF8),
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                    ),
                  ),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.redAccent),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                    ),
                    icon: const Icon(
                      Icons.refresh,
                      size: 14,
                      color: Colors.redAccent,
                    ),
                    label: const Text(
                      "Reset Knowledge",
                      style: TextStyle(color: Colors.redAccent, fontSize: 11),
                    ),
                    onPressed: () async {
                      await CompanionService.resetLearnedKnowledge();
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              "AI Companion memory cleared! Starting fresh.",
                            ),
                          ),
                        );
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                "This AI companion automatically extracts and retains your style, interests, and instructions as you converse.",
                style: TextStyle(color: Colors.white54, fontSize: 11.5),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: facts.isEmpty
                    ? Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.menu_book,
                                color: Colors.white.withOpacity(0.3),
                                size: 40,
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                "No memories recorded yet",
                                style: TextStyle(
                                  color: Colors.white60,
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                "Chat with your companion to begin learning!",
                                style: TextStyle(
                                  color: Colors.white38,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView(
                        children: facts.entries.map((entry) {
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white12),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text("💡", style: TextStyle(fontSize: 14)),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        entry.key
                                            .replaceAll('_', ' ')
                                            .toUpperCase(),
                                        style: const TextStyle(
                                          color: Color(0xFFFDE047),
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        "${entry.value}",
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ── TAB 3: PERSONA & STYLE ───────────────────────────────────
  Widget _buildPersonaTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(18.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "COMPANION FORM",
            style: TextStyle(
              color: Color(0xFF38BDF8),
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _buildTypeCard('robot', '🤖 Cyber Bot'),
              const SizedBox(width: 8),
              _buildTypeCard('cyber_cat', '🐱 Mecha Cat'),
              const SizedBox(width: 8),
              _buildTypeCard('retro_dog', '🐶 Pixel Pup'),
              const SizedBox(width: 8),
              _buildTypeCard('mystic_wisp', '🔮 Wisp'),
            ],
          ),
          const SizedBox(height: 20),



          // Speech & Voice Settings
          const Text(
            "VOICE & SPEECH (TTS)",
            style: TextStyle(
              color: Color(0xFF38BDF8),
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(
                          Icons.volume_up,
                          color: Color(0xFF38BDF8),
                          size: 18,
                        ),
                        SizedBox(width: 8),
                        Text(
                          "Auto-Read Companion Replies",
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    ValueListenableBuilder<bool>(
                      valueListenable: TtsService.autoSpeak,
                      builder: (context, autoSpeak, _) {
                        return Switch(
                          value: autoSpeak,
                          activeColor: const Color(0xFF10B981),
                          onChanged: (val) => TtsService.autoSpeak.value = val,
                        );
                      },
                    ),
                  ],
                ),
                const Divider(color: Colors.white12, height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      "Voice Pitch (Robotic Accent)",
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F172A),
                        foregroundColor: const Color(0xFF38BDF8),
                        side: const BorderSide(
                          color: Color(0xFF38BDF8),
                          width: 1,
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                      ),
                      icon: const Icon(Icons.play_arrow, size: 14),
                      label: const Text(
                        "Test Voice 🔊",
                        style: TextStyle(fontSize: 11),
                      ),
                      onPressed: () {
                        TtsService.speak(
                          "Beep-boop! Hello ${widget.userName}! I am your AI companion in TeemChat.",
                        );
                      },
                    ),
                  ],
                ),
                ValueListenableBuilder<double>(
                  valueListenable: TtsService.pitch,
                  builder: (context, pitchVal, _) {
                    return Slider(
                      value: pitchVal,
                      min: 0.8,
                      max: 1.6,
                      divisions: 8,
                      activeColor: const Color(0xFF38BDF8),
                      inactiveColor: Colors.white24,
                      label: pitchVal > 1.15
                          ? "Robotic / High (${pitchVal.toStringAsFixed(2)})"
                          : "Natural (${pitchVal.toStringAsFixed(2)})",
                      onChanged: (v) => TtsService.pitch.value = v,
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          const Text(
            "COMPANION NAME",
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white24),
            ),
            child: TextField(
              controller: _nameController,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: const InputDecoration(
                border: InputBorder.none,
                hintText: "Enter companion name...",
                hintStyle: TextStyle(color: Colors.white38),
              ),
            ),
          ),
          const SizedBox(height: 16),

          const Text(
            "CUSTOM PERSONA INSTRUCTION",
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white24),
            ),
            child: TextField(
              controller: _personaController,
              maxLines: 4,
              style: const TextStyle(color: Colors.white, fontSize: 12.5),
              decoration: const InputDecoration(
                border: InputBorder.none,
                hintText:
                    "Define how this AI agent should act, speak, and advise you...",
                hintStyle: TextStyle(color: Colors.white38),
              ),
            ),
          ),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.inkBlack,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.check_circle, size: 18),
              label: const Text(
                "SAVE PERSONA & PREFERENCES",
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
              onPressed: _savePersonaSettings,
            ),
          ),
        ],
      ),
    );
  }



  Widget _buildTypeCard(String typeKey, String label) {
    final isSelected = _selectedType == typeKey;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedType = typeKey),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.primary.withOpacity(0.25)
                : const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? AppColors.primary : Colors.white12,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(
                label.split(' ').first,
                style: const TextStyle(fontSize: 22),
              ),
              const SizedBox(height: 4),
              Text(
                label.split(' ').last,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white60,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
