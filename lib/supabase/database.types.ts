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
          created_at: string
          id: number
          name: string
          party_id: number
          price: number
          quantity: number
          sold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          party_id: number
          price: number
          quantity: number
          sold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          party_id?: number
          price?: number
          quantity?: number
          sold?: number
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
          created_at: string
          email: string
          id: string
          is_admin: boolean
          kyc_status: string
          last_activity_at: string | null
          name: string
          payout_preferences: Json
          phone: string | null
          push_enabled: boolean
          role: string
        }
        Insert: {
          account_status?: string
          bank_account_encrypted?: string | null
          bio?: string | null
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          kyc_status?: string
          last_activity_at?: string | null
          name: string
          payout_preferences?: Json
          phone?: string | null
          push_enabled?: boolean
          role?: string
        }
        Update: {
          account_status?: string
          bank_account_encrypted?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          kyc_status?: string
          last_activity_at?: string | null
          name?: string
          payout_preferences?: Json
          phone?: string | null
          push_enabled?: boolean
          role?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      settle_order_payment: {
        Args: {
          p_order_id: string
          p_payment_status: string
        }
        Returns: undefined
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
