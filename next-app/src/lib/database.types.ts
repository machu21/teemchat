export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_companions: {
        Row: {
          avatar_style: string
          companion_type: string
          created_at: string
          id: string
          is_active: boolean
          learned_context: Json
          name: string
          persona: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_style?: string
          companion_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          learned_context?: Json
          name?: string
          persona?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_style?: string
          companion_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          learned_context?: Json
          name?: string
          persona?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_companions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          id: string
          max_daily_messages: number
          message_count: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_daily_messages?: number
          message_count?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_daily_messages?: number
          message_count?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_catalog_items: {
        Row: {
          asset_svg: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          item_key: string
          item_type: string
          rarity: string
          required_tier: string
        }
        Insert: {
          asset_svg?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          item_key: string
          item_type: string
          rarity?: string
          required_tier?: string
        }
        Update: {
          asset_svg?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          item_key?: string
          item_type?: string
          rarity?: string
          required_tier?: string
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_pdf: string | null
          paid_at: string | null
          status: string
          stripe_invoice_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_preview: string | null
          user_one: string
          user_two: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_preview?: string | null
          user_one: string
          user_two: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_preview?: string | null
          user_one?: string
          user_two?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_conversations_user_one_fkey"
            columns: ["user_one"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buddy_conversations_user_two_fkey"
            columns: ["user_two"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_participants: {
        Row: {
          call_session_id: string
          duration_seconds: number
          end_reason: string | null
          id: string
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_session_id: string
          duration_seconds?: number
          end_reason?: string | null
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_session_id?: string
          duration_seconds?: number
          end_reason?: string | null
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          call_type: string
          conversation_id: string | null
          duration_seconds: number
          ended_at: string | null
          id: string
          is_video: boolean
          room_name: string
          space_id: string | null
          started_at: string
          started_by: string
          status: string
        }
        Insert: {
          call_type?: string
          conversation_id?: string | null
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          is_video?: boolean
          room_name: string
          space_id?: string | null
          started_at?: string
          started_by: string
          status?: string
        }
        Update: {
          call_type?: string
          conversation_id?: string | null
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          is_video?: boolean
          room_name?: string
          space_id?: string | null
          started_at?: string
          started_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_memories: {
        Row: {
          category: string
          companion_id: string
          created_at: string
          embedding: string | null
          id: string
          importance_score: number
          memory_key: string
          memory_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          companion_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number
          memory_key: string
          memory_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          companion_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          importance_score?: number
          memory_key?: string
          memory_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_memories_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "ai_companions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_messages: {
        Row: {
          companion_id: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          companion_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          companion_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_messages_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "ai_companions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_message_attachments: {
        Row: {
          created_at: string
          direct_message_id: string
          file_name: string
          file_size_bytes: number
          file_url: string
          id: string
          mime_type: string
        }
        Insert: {
          created_at?: string
          direct_message_id: string
          file_name: string
          file_size_bytes?: number
          file_url: string
          id?: string
          mime_type?: string
        }
        Update: {
          created_at?: string
          direct_message_id?: string
          file_name?: string
          file_size_bytes?: number
          file_url?: string
          id?: string
          mime_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_message_attachments_direct_message_id_fkey"
            columns: ["direct_message_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "buddy_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          user_one: string
          user_two: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_one: string
          user_two: string
        }
        Update: {
          created_at?: string
          id?: string
          user_one?: string
          user_two?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_user_one_fkey"
            columns: ["user_one"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_two_fkey"
            columns: ["user_two"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "group_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_conversations: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string
          id: string
          last_message_at: string
          last_preview: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          last_message_at?: string
          last_preview?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          last_message_at?: string
          last_preview?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "group_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number
          file_url: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number
          file_url: string
          height?: number | null
          id?: string
          message_id: string
          mime_type?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          file_url?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_mentions: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          mentioned_user_id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          mentioned_user_id: string
          message_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          mentioned_user_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          is_edited: boolean
          is_pinned: boolean
          reply_to_id: string | null
          room_id: string
          sender_id: string
          space_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean
          is_pinned?: boolean
          reply_to_id?: string | null
          room_id: string
          sender_id: string
          space_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean
          is_pinned?: boolean
          reply_to_id?: string | null
          room_id?: string
          sender_id?: string
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_tracks: {
        Row: {
          artist: string | null
          audio_url: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          order_index: number | null
          playlist_id: string
          title: string
        }
        Insert: {
          artist?: string | null
          audio_url: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          playlist_id: string
          title: string
        }
        Update: {
          artist?: string | null
          audio_url?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          playlist_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "space_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_config: Json
          created_at: string
          display_name: string
          has_ai_companion: boolean
          id: string
          is_paid: boolean
          status: string
          status_message: string | null
          tier: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_config?: Json
          created_at?: string
          display_name?: string
          has_ai_companion?: boolean
          id: string
          is_paid?: boolean
          status?: string
          status_message?: string | null
          tier?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_config?: Json
          created_at?: string
          display_name?: string
          has_ai_companion?: boolean
          id?: string
          is_paid?: boolean
          status?: string
          status_message?: string | null
          tier?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          id: string
          kind: string
          name: string
          position_x: number
          position_y: number
          radius: number
          sort_order: number
          space_id: string
          topic: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          kind?: string
          name: string
          position_x?: number
          position_y?: number
          radius?: number
          sort_order?: number
          space_id: string
          topic?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position_x?: number
          position_y?: number
          radius?: number
          sort_order?: number
          space_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          space_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          space_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          space_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_audit_logs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          reason: string | null
          space_id: string
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          space_id: string
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string | null
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_bans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          space_id: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          space_id: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          space_id?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          id: string
          is_pinned: boolean
          joined_at: string
          last_seen_at: string
          role: string
          role_id: string | null
          space_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_pinned?: boolean
          joined_at?: string
          last_seen_at?: string
          role?: string
          role_id?: string | null
          space_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_pinned?: boolean
          joined_at?: string
          last_seen_at?: string
          role?: string
          role_id?: string | null
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "space_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_mutes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          mute_type: string
          muted_by: string | null
          reason: string | null
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          mute_type?: string
          muted_by?: string | null
          reason?: string | null
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          mute_type?: string
          muted_by?: string | null
          reason?: string | null
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_mutes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_playlists: {
        Row: {
          artist: string | null
          audio_url: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          order_index: number | null
          space_id: string
          title: string
        }
        Insert: {
          artist?: string | null
          audio_url: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          space_id: string
          title: string
        }
        Update: {
          artist?: string | null
          audio_url?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          space_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_playlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_playlists_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_roles: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          permissions: Json
          priority: number
          space_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          permissions?: Json
          priority?: number
          space_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          permissions?: Json
          priority?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_roles_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_settings: {
        Row: {
          allow_guest_chat: boolean
          allow_screen_share: boolean
          background_music_volume: number
          default_spawn_x: number
          default_spawn_y: number
          max_audio_bitrate: number
          space_id: string
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          allow_guest_chat?: boolean
          allow_screen_share?: boolean
          background_music_volume?: number
          default_spawn_x?: number
          default_spawn_y?: number
          max_audio_bitrate?: number
          space_id: string
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          allow_guest_chat?: boolean
          allow_screen_share?: boolean
          background_music_volume?: number
          default_spawn_x?: number
          default_spawn_y?: number
          max_audio_bitrate?: number
          space_id?: string
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_settings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_tilemaps: {
        Row: {
          collision_matrix: Json
          id: string
          layers: Json
          map_height: number
          map_width: number
          space_id: string
          tile_size: number
          updated_at: string
          version: number
        }
        Insert: {
          collision_matrix?: Json
          id?: string
          layers?: Json
          map_height?: number
          map_width?: number
          space_id: string
          tile_size?: number
          updated_at?: string
          version?: number
        }
        Update: {
          collision_matrix?: Json
          id?: string
          layers?: Json
          map_height?: number
          map_width?: number
          space_id?: string
          tile_size?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_tilemaps_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          join_code: string | null
          map_theme: string
          max_capacity: number
          member_count: number
          name: string
          owner_id: string | null
          palette_index: number
          slug: string
          tier: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          join_code?: string | null
          map_theme?: string
          max_capacity?: number
          member_count?: number
          name: string
          owner_id?: string | null
          palette_index?: number
          slug: string
          tier?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          join_code?: string | null
          map_theme?: string
          max_capacity?: number
          member_count?: number
          name?: string
          owner_id?: string | null
          palette_index?: number
          slug?: string
          tier?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_avatar_inventory: {
        Row: {
          acquired_at: string
          id: string
          is_equipped: boolean
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          is_equipped?: boolean
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          is_equipped?: boolean
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_avatar_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "avatar_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_avatar_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_user_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          camera_device_id: string | null
          keybindings: Json
          master_volume: number
          mic_device_id: string | null
          noise_cancellation_enabled: boolean
          notifications_enabled: boolean
          sfx_enabled: boolean
          sfx_volume: number
          speaker_device_id: string | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          camera_device_id?: string | null
          keybindings?: Json
          master_volume?: number
          mic_device_id?: string | null
          noise_cancellation_enabled?: boolean
          notifications_enabled?: boolean
          sfx_enabled?: boolean
          sfx_volume?: number
          speaker_device_id?: string | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          camera_device_id?: string | null
          keybindings?: Json
          master_volume?: number
          mic_device_id?: string | null
          noise_cancellation_enabled?: boolean
          notifications_enabled?: boolean
          sfx_enabled?: boolean
          sfx_volume?: number
          speaker_device_id?: string | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          resolved_by: string | null
          room_id: string | null
          space_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id: string
          reporter_id: string
          resolved_by?: string | null
          room_id?: string | null
          space_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          resolved_by?: string | null
          room_id?: string | null
          space_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_type: string
          id: string
          ip_address: unknown
          last_active_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          ip_address?: unknown
          last_active_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          ip_address?: unknown
          last_active_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          has_ai_unlimited: boolean
          id: string
          metadata: Json | null
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          has_ai_unlimited?: boolean
          id?: string
          metadata?: Json | null
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          has_ai_unlimited?: boolean
          id?: string
          metadata?: Json | null
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboard_sessions: {
        Row: {
          board_data: Json
          id: string
          last_edited_by: string | null
          space_id: string
          updated_at: string
          version: number
          world_object_id: string
        }
        Insert: {
          board_data?: Json
          id?: string
          last_edited_by?: string | null
          space_id: string
          updated_at?: string
          version?: number
          world_object_id: string
        }
        Update: {
          board_data?: Json
          id?: string
          last_edited_by?: string | null
          space_id?: string
          updated_at?: string
          version?: number
          world_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_sessions_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboard_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whiteboard_sessions_world_object_id_fkey"
            columns: ["world_object_id"]
            isOneToOne: true
            referencedRelation: "world_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      world_objects: {
        Row: {
          created_at: string
          id: string
          object_type: string
          placed_by: string | null
          properties: Json
          rotation: number
          space_id: string
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          id?: string
          object_type: string
          placed_by?: string | null
          properties?: Json
          rotation?: number
          space_id: string
          x: number
          y: number
        }
        Update: {
          created_at?: string
          id?: string
          object_type?: string
          placed_by?: string | null
          properties?: Json
          rotation?: number
          space_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_objects_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_objects_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      worlds: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          visibility?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_increment_ai_usage: {
        Args: { p_daily_limit?: number }
        Returns: Json
      }
      cleanup_guest_user: { Args: { p_user_id: string }; Returns: boolean }
      delete_guest_account: { Args: never; Returns: boolean }
      get_ai_usage_status: { Args: { p_daily_limit?: number }; Returns: Json }
      get_recent_companion_memories: {
        Args: { p_companion_id: string; p_limit?: number }
        Returns: {
          category: string
          created_at: string
          id: string
          importance_score: number
          memory_key: string
          memory_value: string
        }[]
      }
      is_admin_of_space: { Args: { _space_id: string }; Returns: boolean }
      is_member_of_group: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_member_of_space: { Args: { _space_id: string }; Returns: boolean }
      join_space_via_invite: { Args: { p_code: string }; Returns: string }
      match_companion_memories: {
        Args: {
          p_companion_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
        }
        Returns: {
          category: string
          created_at: string
          id: string
          importance_score: number
          memory_key: string
          memory_value: string
          similarity: number
        }[]
      }
      provision_guest_account: {
        Args: {
          p_avatar_config?: Json
          p_display_name: string
          p_password: string
        }
        Returns: Json
      }
      resolve_space_invite: {
        Args: { p_code: string }
        Returns: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          join_code: string | null
          map_theme: string
          max_capacity: number
          member_count: number
          name: string
          owner_id: string | null
          palette_index: number
          slug: string
          tier: string
          updated_at: string
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "spaces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
