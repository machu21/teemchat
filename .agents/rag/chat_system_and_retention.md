# Chat Architecture & 30-Second TTL Hard-Removal Specification

## 1. Current Chat Architecture

Text messages flow through a dual-mechanism pipeline:
1. **Database Path**:
   - Written to PostgreSQL table `public.messages`.
   - Replicated via `supabase_realtime` using `RealtimeListenTypes.postgresChanges` on `event: 'INSERT'`.
2. **Ephemeral Broadcast Fallback**:
   - Broadcast directly across the Realtime channel `space:$spaceId:world` on `event: 'chat'`.

---

## 2. Feasibility of 30-Second Hard-Removal

**Question**: *Is it possible to hard-remove chat every 30 seconds for both frontend and database?*
**Verdict**: **Yes, 100% possible, highly practical, and clean to implement.**

---

## 3. Implementation Strategy: Frontend

In `WorldScreen` (`lib/features/world/world_screen.dart`):

1. **Active Pruning Timer**:
   Maintain a periodic 1-second background timer:
   ```dart
   Timer? _chatPruneTimer;

   void _startChatPruneTimer() {
     _chatPruneTimer?.cancel();
     _chatPruneTimer = Timer.periodic(const Duration(seconds: 1), (_) {
       if (!mounted) return;
       final now = DateTime.now();
       final initialCount = _messages.length;
       
       _messages.removeWhere((msg) {
         final ageInSeconds = now.difference(msg.createdAt).inSeconds;
         return ageInSeconds >= 30;
       });

       if (_messages.length != initialCount) {
         setState(() {});
       }
     });
   }
   ```

2. **Realtime `DELETE` Event Synchronization**:
   In `ChatService.listenToRoomMessages`:
   ```dart
   _channel.on(
     RealtimeListenTypes.postgresChanges,
     ChannelFilter(
       event: 'DELETE',
       schema: 'public',
       table: 'messages',
       filter: 'room_id=eq.$roomId',
     ),
     (payload, [ref]) {
       final oldRecord = payload['old'] as Map<String, dynamic>?;
       final deletedId = oldRecord?['id'] as String?;
       if (deletedId != null) {
         onMessageDeleted(deletedId);
       }
     },
   );
   ```

---

## 4. Implementation Strategy: Database (PostgreSQL)

### Option A: Automatic On-Insert Trigger (Zero Infrastructure overhead)
Whenever any new message is inserted into `public.messages`, PostgreSQL automatically deletes all records older than 30 seconds:

```sql
create or replace function public.purge_expired_messages()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.messages
  where created_at < now() - interval '30 seconds';
  return new;
end;
$$;

drop trigger if exists trg_purge_expired_messages on public.messages;
create trigger trg_purge_expired_messages
after insert on public.messages
for each statement
execute function public.purge_expired_messages();
```

*Key Benefit*: Runs without needing external cron schedulers or extensions. If a room is active, expired messages are pruned automatically on every statement.

### Option B: Scheduled Cleanup via `pg_cron`
If the database has `pg_cron` enabled on Supabase:
```sql
create extension if not exists pg_cron;

select cron.schedule(
  'purge_messages_every_30s',
  '* * * * *',
  $$delete from public.messages where created_at < now() - interval '30 seconds';$$
);
```

### Option C: Complete Ephemeral Switch (Pure In-Memory Broadcast)
If messages must strictly disappear after 30 seconds and no long-term persistence is desired:
- Stop inserting into `public.messages`.
- Send messages entirely via `_channel.send(type: RealtimeListenTypes.broadcast, event: 'chat')`.
- Store only in Flutter memory for 30 seconds before evicting.
- *Trade-off*: Users who join mid-session will not see past 20-second chat history unless synchronized via room presence. Option A (Postgres with 30s TTL) is superior because it preserves the 30-second rolling window for newcomers.
