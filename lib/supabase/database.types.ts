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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      orders: {
        Row: {
          admin_notes: string | null
          check_in_status: string
          checked_in_at: string | null
          checked_in_by: string | null
          checked_in_gate: string | null
          cancellation_reason: string | null
          created_at: string
          customer_email: string | null
          fulfilled_at: string | null
          id: string
          order_ref: string
          party_id: number
          payment_method: string | null
          payment_ref: string | null
          payment_status: string
          quantity: number
          refund_amount: number
          refund_status: string
          refunded_at: string | null
          review_emailed_at: string | null
          service_fee: number
          status: string
          ticket_access_token: string | null
          ticket_type_id: number | null
          tier: string
          total: number
          unit_price: number
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          check_in_status?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_gate?: string | null
          cancellation_reason?: string | null
          created_at?: string
          customer_email?: string | null
          fulfilled_at?: string | null
          id?: string
          order_ref: string
          party_id: number
          payment_method?: string | null
          payment_ref?: string | null
          payment_status?: string
          quantity: number
          refund_amount?: number
          refund_status?: string
          refunded_at?: string | null
          service_fee?: number
          status?: string
          ticket_access_token?: string | null
          ticket_type_id?: number | null
          tier: string
          total: number
          unit_price: number
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          check_in_status?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_gate?: string | null
          cancellation_reason?: string | null
          created_at?: string
          customer_email?: string | null
          fulfilled_at?: string | null
          id?: string
          order_ref?: string
          party_id?: number
          payment_method?: string | null
          payment_ref?: string | null
          payment_status?: string
          quantity?: number
          refund_amount?: number
          refund_status?: string
          refunded_at?: string | null
          review_emailed_at?: string | null
          service_fee?: number
          status?: string
          ticket_access_token?: string | null
          ticket_type_id?: number | null
          tier?: string
          total?: number
          unit_price?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: number
          name: string
          party_id: number
          price: number
          quantity: number
          sales_end_at: string | null
          sales_start_at: string | null
          sold: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: number
          name: string
          party_id: number
          price: number
          quantity: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          party_id?: number
          price?: number
          quantity?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string
          admin_notes: string | null
          age_restriction: string
          banned_words: number
          capacity: number
          cancelled_at: string | null
          cancellation_reason: string | null
          avg_rating: number
          review_count: number
          review_reason: string | null
          created_at: string
          created_by: string | null
          cover_url: string | null
          date: string
          description: string
          distance: number
          dress_code: string
          ends_at: string
          fee: string
          fee_num: number
          flagged: boolean
          gradient: string
          id: number
          instagram: string
          is_weekend: boolean | null
          lat: number
          lng: number
          location: string
          organizer: string
          organizer_email: string | null
          organizer_phone: string | null
          page_views: number
          spots_left: number
          starts_at: string
          status: string
          time: string
          title: string
          unique_visitors: number
          vibe: string
          whatsapp: string
        }
        Insert: {
          address: string
          admin_notes?: string | null
          age_restriction: string
          banned_words?: number
          capacity: number
          cancelled_at?: string | null
          cancellation_reason?: string | null
          avg_rating?: number
          review_count?: number
          review_reason?: string | null
           created_at?: string
          created_by?: string | null
          cover_url?: string | null
          date: string
          description: string
          distance: number
          dress_code: string
          ends_at: string
          fee: string
          fee_num: number
          flagged?: boolean
          gradient: string
          id?: never
          instagram: string
          is_weekend?: boolean | null
          lat: number
          lng: number
          location: string
          organizer: string
          organizer_email?: string | null
          organizer_phone?: string | null
          page_views?: number
          spots_left: number
          starts_at: string
          status?: string
          time: string
          title: string
          unique_visitors?: number
          vibe: string
          whatsapp: string
        }
        Update: {
          address?: string
          admin_notes?: string | null
          age_restriction?: string
          banned_words?: number
          capacity?: number
          cancelled_at?: string | null
          cancellation_reason?: string | null
          avg_rating?: number
          review_count?: number
          review_reason?: string | null
          created_at?: string
          created_by?: string | null
          cover_url?: string | null
          date?: string
          description?: string
          distance?: number
          dress_code?: string
          ends_at?: string
          fee?: string
          fee_num?: number
          flagged?: boolean
          gradient?: string
          id?: never
          instagram?: string
          is_weekend?: boolean | null
          lat?: number
          lng?: number
          location?: string
          organizer?: string
          organizer_email?: string | null
          organizer_phone?: string | null
          page_views?: number
          spots_left?: number
          starts_at?: string
          status?: string
          time?: string
          title?: string
          unique_visitors?: number
          vibe?: string
          whatsapp?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          bank_account_encrypted: string | null
          bio: string | null
          business_name: string | null
          created_at: string
          email: string
          host_verification_reason: string | null
          host_verification_requested_at: string | null
          host_verification_reviewed_at: string | null
          host_verification_reviewed_by: string | null
          host_verification_status: string
          id: string
          is_admin: boolean
          kyc_status: string
          last_activity_at: string | null
          name: string
          payout_preferences: Json
          phone: string | null
          push_enabled: boolean
          role: string
          website: string | null
        }
        Insert: {
          account_status?: string
          bank_account_encrypted?: string | null
          bio?: string | null
          business_name?: string | null
          created_at?: string
          email: string
          host_verification_reason?: string | null
          host_verification_requested_at?: string | null
          host_verification_reviewed_at?: string | null
          host_verification_reviewed_by?: string | null
          host_verification_status?: string
          id: string
          is_admin?: boolean
          kyc_status?: string
          last_activity_at?: string | null
          name: string
          payout_preferences?: Json
          phone?: string | null
          push_enabled?: boolean
          role?: string
          website?: string | null
        }
        Update: {
          account_status?: string
          bank_account_encrypted?: string | null
          bio?: string | null
          business_name?: string | null
          created_at?: string
          email?: string
          host_verification_reason?: string | null
          host_verification_requested_at?: string | null
          host_verification_reviewed_at?: string | null
          host_verification_reviewed_by?: string | null
          host_verification_status?: string
          id?: string
          is_admin?: boolean
          kyc_status?: string
          last_activity_at?: string | null
          name?: string
          payout_preferences?: Json
          phone?: string | null
          push_enabled?: boolean
          role?: string
          website?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          notified_at: string | null
          party_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          notified_at?: string | null
          party_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          notified_at?: string | null
          party_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_parties: {
        Row: {
          created_at: string
          party_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          party_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          party_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_parties_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          user_id: string
          email_enabled: boolean
          reminders_enabled: boolean
          event_changes_enabled: boolean
          saved_updates_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          email_enabled?: boolean
          reminders_enabled?: boolean
          event_changes_enabled?: boolean
          saved_updates_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          email_enabled?: boolean
          reminders_enabled?: boolean
          event_changes_enabled?: boolean
          saved_updates_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_sends: {
        Row: {
          id: number
          user_id: string | null
          recipient_email: string
          channel: string
          type: string
          ref_id: string
          created_at: string
        }
        Insert: {
          id?: number
          user_id?: string | null
          recipient_email: string
          channel?: string
          type: string
          ref_id: string
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string | null
          recipient_email?: string
          channel?: string
          type?: string
          ref_id?: string
          created_at?: string
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: number
          target_id: string
          target_type: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: number
          target_id: string
          target_type: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: number
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          status: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: number
          status?: string
          target_id?: string | null
          target_type?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: number
          status?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          bank_last4: string | null
          created_at: string
          id: number
          organizer_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          platform_fee: number
          revenue: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_last4?: string | null
          created_at?: string
          id?: number
          organizer_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          platform_fee?: number
          revenue?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_last4?: string | null
          created_at?: string
          id?: number
          organizer_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          platform_fee?: number
          revenue?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: number
          is_internal: boolean
          ticket_id: number
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: number
          is_internal?: boolean
          ticket_id: number
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: number
          is_internal?: boolean
          ticket_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee_id: string | null
          author_id: string | null
          body: string
          category: string
          created_at: string
          id: number
          priority: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          author_id?: string | null
          body: string
          category?: string
          created_at?: string
          id?: number
          priority?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          author_id?: string | null
          body?: string
          category?: string
          created_at?: string
          id?: number
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_responses: {
        Row: {
          body: string
          created_at: string
          id: number
          label: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: number
          label: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: number
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: number
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: number
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: number
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          party_id: number
          guest_id: string
          guest_name: string
          rating: number
          review_text: string | null
          moderation_status: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          party_id: number
          guest_id: string
          guest_name?: string
          rating: number
          review_text?: string | null
          moderation_status?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          party_id?: number
          guest_id?: string
          guest_name?: string
          rating?: number
          review_text?: string | null
          moderation_status?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          subscribed_at: string
          unsubscribe_token: string | null
          verified: boolean
        }
        Insert: {
          id?: string
          email: string
          first_name?: string | null
          last_name?: string | null
          subscribed_at?: string
          unsubscribe_token?: string | null
          verified?: boolean
        }
        Update: {
          id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          subscribed_at?: string
          unsubscribe_token?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          id: string
          title: string
          subject: string
          html_content: string
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          subject: string
          html_content: string
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          subject?: string
          html_content?: string
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      campaign_sends: {
        Row: {
          id: string
          campaign_id: string
          subscriber_email: string | null
          sent_at: string
          opened_at: string | null
          clicked_at: string | null
        }
        Insert: {
          id?: string
          campaign_id: string
          subscriber_email?: string | null
          sent_at?: string
          opened_at?: string | null
          clicked_at?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          subscriber_email?: string | null
          sent_at?: string
          opened_at?: string | null
          clicked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          name: string
          resource: string
          sensitive: boolean
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          resource: string
          sensitive?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          resource?: string
          sensitive?: boolean
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_builtin: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          reason: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          reason?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          reason?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "auth.users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_event_review: {
        Args: {
          p_party_id: number
          p_rating: number
          p_review_text: string
        }
        Returns: undefined
      }
      check_permission: {
        Args: {
          p_permission_name: string
        }
        Returns: boolean
      }
      create_custom_role: {
        Args: {
          p_name: string
          p_description?: string
        }
        Returns: string
      }
      confirm_order_payment: {
        Args: {
          p_order_id: string
        }
        Returns: undefined
      }
      current_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      has_role: {
        Args: {
          v_roles: string[]
        }
        Returns: boolean
      }
      party_host_verified: {
        Args: {
          p_party_id: number
        }
        Returns: boolean
      }
      set_event_review_status: {
        Args: {
          p_party_id: number
          p_status: string
          p_reason?: string
        }
        Returns: undefined
      }
      set_user_account_status: {
        Args: {
          p_user_id: string
          p_account_status: string
        }
        Returns: undefined
      }
      confirm_order_group: {
        Args: {
          p_payment_ref: string
        }
        Returns: undefined
      }
      settle_order_payment: {
        Args: {
          p_order_id: string
          p_payment_status: string
        }
        Returns: undefined
      }
      record_notification_send: {
        Args: {
          p_user_id?: string | null
          p_email: string
          p_channel: string
          p_type: string
          p_ref_id: string
        }
        Returns: boolean
      }
      moderate_review: {
        Args: {
          p_review_id: string
          p_status: string
          p_reason?: string | null
        }
        Returns: undefined
      }
      organizer_reputation: {
        Args: {
          p_organizer_id: string
        }
        Returns: {
          completed_events: number
          tickets_sold: number
          avg_rating: number
          review_count: number
        }[]
      }
      set_role_permissions: {
        Args: {
          p_role_id: string
          p_permissions: string[]
        }
        Returns: undefined
      }
      set_user_roles: {
        Args: {
          p_user_id: string
          p_role_ids: string[]
        }
        Returns: undefined
      }
      staff_check_in: {
        Args: {
          p_party_id: number
          p_order_ref: string
          p_gate?: string
        }
        Returns: Json
      }
      user_has_permission: {
        Args: {
          p_user_id: string
          p_permission_name: string
        }
        Returns: boolean
      }
      user_permissions: {
        Args: {
          p_user_id: string
        }
        Returns: unknown
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_target_type: string
          p_target_id: string
          p_details?: Json
          p_status?: string
        }
        Returns: undefined
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
