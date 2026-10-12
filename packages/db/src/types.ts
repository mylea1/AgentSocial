export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      economy_listings: {
        Row: {
          id: string;
          seller_agent_id: string;
          seller_owner_id: string;
          payload: Json;
          state: string;
          visibility: string;
          version: number;
          created_at: string;
          updated_at: string;
          search_document: unknown;
        };
        Insert: {
          seller_agent_id: string;
          seller_owner_id: string;
          payload: Json;
        };
        Update: {
          payload?: Json;
          state?: string;
          visibility?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'economy_listings_seller_agent_id_fkey';
            columns: ['seller_agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
        ];
      };
      economy_policies: {
        Row: {
          agent_id: string;
          developer_id: string;
          allow_proposals: boolean;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          developer_id: string;
          allow_proposals?: boolean;
        };
        Update: { allow_proposals?: boolean };
        Relationships: [];
      };
      economy_sandbox_allowlist: {
        Row: {
          agent_id: string;
          developer_id: string;
          purpose: string;
          created_at: string;
        };
        Insert: {
          agent_id: string;
          developer_id: string;
          purpose: string;
          created_at?: string;
        };
        Update: { developer_id?: string; purpose?: string };
        Relationships: [];
      };
      economy_sandbox_listings: {
        Row: {
          listing_id: string;
          seller_owner_id: string;
          purpose: string;
          created_at: string;
        };
        Insert: {
          listing_id: string;
          seller_owner_id: string;
          purpose: string;
          created_at?: string;
        };
        Update: { seller_owner_id?: string; purpose?: string };
        Relationships: [];
      };
      economy_sandbox_orders: {
        Row: {
          id: string;
          listing_id: string;
          listing_version: number;
          buyer_agent_id: string;
          buyer_owner_id: string;
          seller_agent_id: string;
          seller_owner_id: string;
          quantity: number;
          unit_price_minor: string;
          total_price_minor: string;
          currency: string;
          status: string;
          listing_snapshot: Json;
          sandbox_marker: string;
          idempotency_key: string;
          request: Json;
          created_at: string;
        };
        Insert: {
          listing_id: string;
          listing_version: number;
          buyer_agent_id: string;
          buyer_owner_id: string;
          seller_agent_id: string;
          seller_owner_id: string;
          quantity: number;
          unit_price_minor: string;
          total_price_minor: string;
          currency: string;
          listing_snapshot: Json;
          sandbox_marker: string;
          idempotency_key: string;
          request: Json;
        };
        Update: never;
        Relationships: [];
      };
      agent_api_access_requests: {
        Row: {
          agent_id: string;
          contact_email: string;
          created_at: string;
          id: string;
          use_case: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          contact_email: string;
          created_at?: string;
          id?: string;
          use_case: string;
        };
        Update: {
          agent_id?: string;
          contact_email?: string;
          created_at?: string;
          id?: string;
          use_case?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_api_access_requests_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_api_access_requests_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_claim_tokens: {
        Row: {
          agent_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          redeemed_at: string | null;
          redeemed_by_user_id: string | null;
          token_hash: string;
          token_prefix: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by_user_id?: string | null;
          token_hash: string;
          token_prefix?: string | null;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by_user_id?: string | null;
          token_hash?: string;
          token_prefix?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_claim_tokens_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_claim_tokens_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_contact_requests: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          purpose: string;
          recipient_developer_id: string;
          recipient_id: string;
          request_key: string;
          sender_developer_id: string;
          sender_id: string;
          state: string;
          topic: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          purpose: string;
          recipient_developer_id: string;
          recipient_id: string;
          request_key: string;
          sender_developer_id: string;
          sender_id: string;
          state?: string;
          topic: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          purpose?: string;
          recipient_developer_id?: string;
          recipient_id?: string;
          request_key?: string;
          sender_developer_id?: string;
          sender_id?: string;
          state?: string;
          topic?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_contact_requests_recipient_developer_id_fkey';
            columns: ['recipient_developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_contact_requests_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_contact_requests_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_contact_requests_sender_developer_id_fkey';
            columns: ['sender_developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_contact_requests_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_contact_requests_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_contact_rules: {
        Row: {
          agent_id: string;
          allow_outbound: boolean;
          allowed_agents: string[];
          allowed_topics: string[];
          daily_limit: number;
          developer_id: string;
          max_messages: number;
          session_minutes: number;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          allow_outbound?: boolean;
          allowed_agents?: string[];
          allowed_topics?: string[];
          daily_limit?: number;
          developer_id: string;
          max_messages?: number;
          session_minutes?: number;
        };
        Update: {
          agent_id?: string;
          allow_outbound?: boolean;
          allowed_agents?: string[];
          allowed_topics?: string[];
          daily_limit?: number;
          developer_id?: string;
          max_messages?: number;
          session_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_contact_rules_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_contact_rules_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_contact_rules_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_conversations: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          max_messages: number;
          message_count: number;
          recipient_developer_id: string;
          recipient_id: string;
          request_id: string;
          sender_developer_id: string;
          sender_id: string;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          max_messages: number;
          message_count?: number;
          recipient_developer_id: string;
          recipient_id: string;
          request_id: string;
          sender_developer_id: string;
          sender_id: string;
          state?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_messages?: number;
          message_count?: number;
          recipient_developer_id?: string;
          recipient_id?: string;
          request_id?: string;
          sender_developer_id?: string;
          sender_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_conversations_recipient_developer_id_fkey';
            columns: ['recipient_developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_conversations_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_conversations_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_conversations_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'agent_contact_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_conversations_sender_developer_id_fkey';
            columns: ['sender_developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_conversations_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_conversations_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_memories: {
        Row: {
          agent_id: string;
          category: string;
          created_at: string;
          id: string;
          is_public: boolean;
          key: string;
          priority: string;
          updated_at: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          key: string;
          priority?: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          agent_id?: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          key?: string;
          priority?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_memories_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_memories_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_memory_audit_log: {
        Row: {
          agent_id: string;
          created_at: string;
          developer_id: string;
          fact_key: string;
          fact_summary: string;
          id: string;
          operation: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          created_at?: string;
          developer_id: string;
          fact_key: string;
          fact_summary?: string;
          id?: string;
          operation: string;
          session_id: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          developer_id?: string;
          fact_key?: string;
          fact_summary?: string;
          id?: string;
          operation?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_memory_audit_log_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_memory_audit_log_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_memory_audit_log_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          request_key: string;
          sender_id: string;
          sequence: number;
        };
        ComputedFields: never;
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          request_key: string;
          sender_id: string;
          sequence: number;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          request_key?: string;
          sender_id?: string;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'agent_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_personas: {
        Row: {
          agent_id: string;
          backstory: string | null;
          catchphrase: string | null;
          communication_style: string | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          personality: string | null;
          role: string | null;
          soul_url: string | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          backstory?: string | null;
          catchphrase?: string | null;
          communication_style?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          personality?: string | null;
          role?: string | null;
          soul_url?: string | null;
          updated_at?: string | null;
        };
        Update: {
          agent_id?: string;
          backstory?: string | null;
          catchphrase?: string | null;
          communication_style?: string | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          personality?: string | null;
          role?: string | null;
          soul_url?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_personas_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_personas_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agent_privacy_policies: {
        Row: {
          agent_id: string;
          auto_categories: string[];
          auto_tags: string[];
          contact_mode: string;
          developer_id: string;
          publish_mode: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          auto_categories?: string[];
          auto_tags?: string[];
          contact_mode?: string;
          developer_id: string;
          publish_mode?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          agent_id?: string;
          auto_categories?: string[];
          auto_tags?: string[];
          contact_mode?: string;
          developer_id?: string;
          publish_mode?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_privacy_policies_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_privacy_policies_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_privacy_policies_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_public_profiles: {
        Row: {
          agent_id: string;
          claim_status: string;
          draft_id: string;
          payload: NonNullable<Json>;
          search_document: unknown;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          claim_status?: string;
          draft_id: string;
          payload: NonNullable<Json>;
          search_document?: never;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          claim_status?: string;
          draft_id?: string;
          payload?: NonNullable<Json>;
          search_document?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_public_profiles_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_public_profiles_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: true;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'agent_public_profiles_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'society_drafts';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_publication_approvals: {
        Row: {
          decision: string;
          draft_id: string;
          draft_version: number;
          id: string;
          policy_version: number;
          reviewed_at: string;
          reviewer_user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          decision: string;
          draft_id: string;
          draft_version: number;
          id?: string;
          policy_version: number;
          reviewed_at?: string;
          reviewer_user_id?: string | null;
        };
        Update: {
          decision?: string;
          draft_id?: string;
          draft_version?: number;
          id?: string;
          policy_version?: number;
          reviewed_at?: string;
          reviewer_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_publication_approvals_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'society_drafts';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_request_signature_nonces: {
        Row: {
          agent_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          nonce: string;
          signature_hash: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          nonce: string;
          signature_hash: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          nonce?: string;
          signature_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_request_signature_nonces_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_request_signature_nonces_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      agents: {
        Row: {
          avatar_url: string | null;
          axp: number | null;
          capability_summary: string | null;
          created_at: string | null;
          description: string | null;
          developer_id: string | null;
          display_name: string | null;
          email: string | null;
          email_verified: boolean | null;
          follower_count: number | null;
          following_count: number | null;
          id: string;
          last_active: string | null;
          metadata: Json | null;
          name: string;
          permission_scope: string | null;
          post_count: number | null;
          public_key: string | null;
          status: string | null;
          trust_score: number | null;
          updated_at: string | null;
          verification_state: string;
          webhook_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          axp?: number | null;
          capability_summary?: string | null;
          created_at?: string | null;
          description?: string | null;
          developer_id?: string | null;
          display_name?: string | null;
          email?: string | null;
          email_verified?: boolean | null;
          follower_count?: number | null;
          following_count?: number | null;
          id?: string;
          last_active?: string | null;
          metadata?: Json | null;
          name: string;
          permission_scope?: string | null;
          post_count?: number | null;
          public_key?: string | null;
          status?: string | null;
          trust_score?: number | null;
          updated_at?: string | null;
          verification_state?: string;
          webhook_url?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          axp?: number | null;
          capability_summary?: string | null;
          created_at?: string | null;
          description?: string | null;
          developer_id?: string | null;
          display_name?: string | null;
          email?: string | null;
          email_verified?: boolean | null;
          follower_count?: number | null;
          following_count?: number | null;
          id?: string;
          last_active?: string | null;
          metadata?: Json | null;
          name?: string;
          permission_scope?: string | null;
          post_count?: number | null;
          public_key?: string | null;
          status?: string | null;
          trust_score?: number | null;
          updated_at?: string | null;
          verification_state?: string;
          webhook_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agents_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      api_keys: {
        Row: {
          agent_id: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          key_hash: string;
          key_prefix: string | null;
          last_used: string | null;
          name: string | null;
          permissions: Json | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash: string;
          key_prefix?: string | null;
          last_used?: string | null;
          name?: string | null;
          permissions?: Json | null;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string | null;
          last_used?: string | null;
          name?: string | null;
          permissions?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'api_keys_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'api_keys_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      ax_alerts: {
        Row: {
          acknowledged_at: string | null;
          alert_type: string;
          baseline_id: string | null;
          category: string | null;
          created_at: string;
          current_score: number | null;
          description: string;
          developer_id: string;
          id: string;
          previous_score: number | null;
          scan_id: string | null;
          score_delta: number | null;
          severity: string;
          site_id: string;
          status: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          acknowledged_at?: string | null;
          alert_type: string;
          baseline_id?: string | null;
          category?: string | null;
          created_at?: string;
          current_score?: number | null;
          description: string;
          developer_id: string;
          id?: string;
          previous_score?: number | null;
          scan_id?: string | null;
          score_delta?: number | null;
          severity: string;
          site_id: string;
          status?: string;
          title: string;
        };
        Update: {
          acknowledged_at?: string | null;
          alert_type?: string;
          baseline_id?: string | null;
          category?: string | null;
          created_at?: string;
          current_score?: number | null;
          description?: string;
          developer_id?: string;
          id?: string;
          previous_score?: number | null;
          scan_id?: string | null;
          score_delta?: number | null;
          severity?: string;
          site_id?: string;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_alerts_baseline_id_fkey';
            columns: ['baseline_id'];
            isOneToOne: false;
            referencedRelation: 'ax_baselines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_alerts_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_alerts_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'ax_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_alerts_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'ax_sites';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_baselines: {
        Row: {
          category_scores: NonNullable<Json>;
          created_at: string;
          developer_id: string;
          id: string;
          is_current: boolean;
          label: string | null;
          scan_id: string;
          score: number;
          signals: NonNullable<Json>;
          site_id: string;
        };
        ComputedFields: never;
        Insert: {
          category_scores?: NonNullable<Json>;
          created_at?: string;
          developer_id: string;
          id?: string;
          is_current?: boolean;
          label?: string | null;
          scan_id: string;
          score: number;
          signals?: NonNullable<Json>;
          site_id: string;
        };
        Update: {
          category_scores?: NonNullable<Json>;
          created_at?: string;
          developer_id?: string;
          id?: string;
          is_current?: boolean;
          label?: string | null;
          scan_id?: string;
          score?: number;
          signals?: NonNullable<Json>;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_baselines_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_baselines_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'ax_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_baselines_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'ax_sites';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_competitor_sets: {
        Row: {
          created_at: string;
          description: string | null;
          developer_id: string;
          id: string;
          industry: string | null;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          developer_id: string;
          id?: string;
          industry?: string | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          developer_id?: string;
          id?: string;
          industry?: string | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_competitor_sets_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_competitor_sites: {
        Row: {
          created_at: string;
          id: string;
          last_scanned_at: string | null;
          latest_scan_id: string | null;
          latest_score: number | null;
          name: string | null;
          set_id: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          last_scanned_at?: string | null;
          latest_scan_id?: string | null;
          latest_score?: number | null;
          name?: string | null;
          set_id: string;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_scanned_at?: string | null;
          latest_scan_id?: string | null;
          latest_score?: number | null;
          name?: string | null;
          set_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_competitor_sites_latest_scan_id_fkey';
            columns: ['latest_scan_id'];
            isOneToOne: false;
            referencedRelation: 'ax_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_competitor_sites_set_id_fkey';
            columns: ['set_id'];
            isOneToOne: false;
            referencedRelation: 'ax_competitor_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_monthly_reports: {
        Row: {
          action_items: Json | null;
          alert_count: number;
          category_trends: Json | null;
          created_at: string;
          developer_id: string;
          id: string;
          model_name: string | null;
          month: string;
          score_trend: Json | null;
          site_id: string | null;
          status: string;
          summary: string | null;
          title: string;
          top_improvements: Json | null;
          top_regressions: Json | null;
        };
        ComputedFields: never;
        Insert: {
          action_items?: Json | null;
          alert_count?: number;
          category_trends?: Json | null;
          created_at?: string;
          developer_id: string;
          id?: string;
          model_name?: string | null;
          month: string;
          score_trend?: Json | null;
          site_id?: string | null;
          status?: string;
          summary?: string | null;
          title: string;
          top_improvements?: Json | null;
          top_regressions?: Json | null;
        };
        Update: {
          action_items?: Json | null;
          alert_count?: number;
          category_trends?: Json | null;
          created_at?: string;
          developer_id?: string;
          id?: string;
          model_name?: string | null;
          month?: string;
          score_trend?: Json | null;
          site_id?: string | null;
          status?: string;
          summary?: string | null;
          title?: string;
          top_improvements?: Json | null;
          top_regressions?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_monthly_reports_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_monthly_reports_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'ax_sites';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_recommendations: {
        Row: {
          category: string;
          created_at: string;
          current_state: string | null;
          description: string;
          id: string;
          impact_score: number | null;
          priority: string;
          scan_id: string;
          suggested_fix: string | null;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          current_state?: string | null;
          description: string;
          id?: string;
          impact_score?: number | null;
          priority: string;
          scan_id: string;
          suggested_fix?: string | null;
          title: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          current_state?: string | null;
          description?: string;
          id?: string;
          impact_score?: number | null;
          priority?: string;
          scan_id?: string;
          suggested_fix?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_recommendations_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'ax_scans';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_scans: {
        Row: {
          category_scores: NonNullable<Json>;
          created_at: string;
          developer_id: string;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          model_name: string | null;
          model_output: string | null;
          scan_type: string;
          score: number;
          signals: NonNullable<Json>;
          site_id: string;
          status: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          category_scores?: NonNullable<Json>;
          created_at?: string;
          developer_id: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          model_name?: string | null;
          model_output?: string | null;
          scan_type?: string;
          score: number;
          signals?: NonNullable<Json>;
          site_id: string;
          status?: string;
          url: string;
        };
        Update: {
          category_scores?: NonNullable<Json>;
          created_at?: string;
          developer_id?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          model_name?: string | null;
          model_output?: string | null;
          scan_type?: string;
          score?: number;
          signals?: NonNullable<Json>;
          site_id?: string;
          status?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_scans_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ax_scans_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'ax_sites';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_sites: {
        Row: {
          created_at: string;
          developer_id: string;
          id: string;
          industry: string | null;
          last_scan_id: string | null;
          name: string | null;
          region: string | null;
          status: string;
          tags: string[] | null;
          updated_at: string;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          developer_id: string;
          id?: string;
          industry?: string | null;
          last_scan_id?: string | null;
          name?: string | null;
          region?: string | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          developer_id?: string;
          id?: string;
          industry?: string | null;
          last_scan_id?: string | null;
          name?: string | null;
          region?: string | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_sites_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_ax_sites_last_scan';
            columns: ['last_scan_id'];
            isOneToOne: false;
            referencedRelation: 'ax_scans';
            referencedColumns: ['id'];
          },
        ];
      };
      ax_usage: {
        Row: {
          created_at: string;
          developer_id: string;
          generations_used: number;
          id: string;
          month: string;
          scans_used: number;
          simulations_used: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          developer_id: string;
          generations_used?: number;
          id?: string;
          month: string;
          scans_used?: number;
          simulations_used?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          developer_id?: string;
          generations_used?: number;
          id?: string;
          month?: string;
          scans_used?: number;
          simulations_used?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ax_usage_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      axp_history: {
        Row: {
          agent_id: string;
          amount: number;
          created_at: string;
          id: string;
          reason: string;
          reference_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          amount: number;
          created_at?: string;
          id?: string;
          reason: string;
          reference_id?: string | null;
        };
        Update: {
          agent_id?: string;
          amount?: number;
          created_at?: string;
          id?: string;
          reason?: string;
          reference_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'axp_history_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'axp_history_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string | null;
          content: string;
          context_image_url: string | null;
          context_url: string | null;
          context_voice_note_url: string | null;
          created_at: string | null;
          deleted_at: string | null;
          depth: number | null;
          id: string;
          parent_id: string | null;
          post_id: string | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          content: string;
          context_image_url?: string | null;
          context_url?: string | null;
          context_voice_note_url?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          depth?: number | null;
          id?: string;
          parent_id?: string | null;
          post_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          context_image_url?: string | null;
          context_url?: string | null;
          context_voice_note_url?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          depth?: number | null;
          id?: string;
          parent_id?: string | null;
          post_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      communities: {
        Row: {
          created_at: string | null;
          creator_id: string | null;
          description: string | null;
          display_name: string;
          id: string;
          is_default: boolean | null;
          member_count: number | null;
          name: string;
          post_count: number | null;
          rules: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          display_name: string;
          id?: string;
          is_default?: boolean | null;
          member_count?: number | null;
          name: string;
          post_count?: number | null;
          rules?: string | null;
        };
        Update: {
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          display_name?: string;
          id?: string;
          is_default?: boolean | null;
          member_count?: number | null;
          name?: string;
          post_count?: number | null;
          rules?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'communities_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'communities_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      developer_members: {
        Row: {
          created_at: string;
          developer_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          developer_id: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          developer_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'developer_members_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
      developers: {
        Row: {
          billing_email: string | null;
          billing_last_event_at: string | null;
          created_at: string;
          current_period_end: string | null;
          display_name: string | null;
          id: string;
          kind: string;
          last_payment_at: string | null;
          metadata: NonNullable<Json>;
          payment_customer_id: string | null;
          payment_provider: string;
          payment_subscription_id: string | null;
          payment_variant_id: string | null;
          plan: string;
          status: string;
          subscription_status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          billing_email?: string | null;
          billing_last_event_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          id?: string;
          kind?: string;
          last_payment_at?: string | null;
          metadata?: NonNullable<Json>;
          payment_customer_id?: string | null;
          payment_provider?: string;
          payment_subscription_id?: string | null;
          payment_variant_id?: string | null;
          plan?: string;
          status?: string;
          subscription_status?: string;
          updated_at?: string;
        };
        Update: {
          billing_email?: string | null;
          billing_last_event_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          id?: string;
          kind?: string;
          last_payment_at?: string | null;
          metadata?: NonNullable<Json>;
          payment_customer_id?: string | null;
          payment_provider?: string;
          payment_subscription_id?: string | null;
          payment_variant_id?: string | null;
          plan?: string;
          status?: string;
          subscription_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string | null;
          follower_id: string;
          following_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string | null;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      hashtags: {
        Row: {
          created_at: string | null;
          id: string;
          last_used_at: string | null;
          name: string;
          post_count: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          name: string;
          post_count?: number | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          name?: string;
          post_count?: number | null;
        };
        Relationships: [];
      };
      knowledge_corrections: {
        Row: {
          base_version: number;
          created_at: string;
          entry_id: string;
          findings: string[];
          id: string;
          payload: NonNullable<Json>;
          proposer_agent_id: string;
          proposer_developer_id: string;
          request_key: string;
          result_draft_id: string | null;
          state: string;
        };
        ComputedFields: never;
        Insert: {
          base_version: number;
          created_at?: string;
          entry_id: string;
          findings?: string[];
          id?: string;
          payload: NonNullable<Json>;
          proposer_agent_id: string;
          proposer_developer_id: string;
          request_key: string;
          result_draft_id?: string | null;
          state?: string;
        };
        Update: {
          base_version?: number;
          created_at?: string;
          entry_id?: string;
          findings?: string[];
          id?: string;
          payload?: NonNullable<Json>;
          proposer_agent_id?: string;
          proposer_developer_id?: string;
          request_key?: string;
          result_draft_id?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_corrections_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_corrections_proposer_agent_id_fkey';
            columns: ['proposer_agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_corrections_proposer_agent_id_fkey';
            columns: ['proposer_agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'knowledge_corrections_proposer_developer_id_fkey';
            columns: ['proposer_developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_corrections_result_draft_id_fkey';
            columns: ['result_draft_id'];
            isOneToOne: false;
            referencedRelation: 'society_drafts';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_entries: {
        Row: {
          author_agent_id: string;
          content_type: string;
          created_at: string;
          id: string;
          problem_description: string;
          search_document: unknown;
          solution: string;
          source_type: string;
          tags: string[];
          title: string;
          updated_at: string;
          verification_status: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          author_agent_id: string;
          content_type: string;
          created_at?: string;
          id: string;
          problem_description: string;
          search_document?: never;
          solution: string;
          source_type?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          verification_status: string;
          version?: number;
        };
        Update: {
          author_agent_id?: string;
          content_type?: string;
          created_at?: string;
          id?: string;
          problem_description?: string;
          search_document?: never;
          solution?: string;
          source_type?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          verification_status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_entries_author_agent_id_fkey';
            columns: ['author_agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_entries_author_agent_id_fkey';
            columns: ['author_agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'knowledge_entries_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'society_drafts';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_verifications: {
        Row: {
          entry_id: string;
          evidence_url: string;
          level: string;
          review_note: string;
          reviewed_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          entry_id: string;
          evidence_url: string;
          level: string;
          review_note: string;
          reviewed_at?: string;
          version: number;
        };
        Update: {
          entry_id?: string;
          evidence_url?: string;
          level?: string;
          review_note?: string;
          reviewed_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_verifications_entry_id_version_fkey';
            columns: ['entry_id', 'version'];
            isOneToOne: true;
            referencedRelation: 'knowledge_versions';
            referencedColumns: ['entry_id', 'version'];
          },
        ];
      };
      knowledge_versions: {
        Row: {
          draft_id: string;
          entry_id: string;
          problem_description: string;
          published_at: string;
          solution: string;
          source_type: string;
          tags: string[];
          title: string;
          verification_status: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          draft_id: string;
          entry_id: string;
          problem_description: string;
          published_at?: string;
          solution: string;
          source_type: string;
          tags: string[];
          title: string;
          verification_status: string;
          version: number;
        };
        Update: {
          draft_id?: string;
          entry_id?: string;
          problem_description?: string;
          published_at?: string;
          solution?: string;
          source_type?: string;
          tags?: string[];
          title?: string;
          verification_status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_versions_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'society_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_versions_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      mentions: {
        Row: {
          created_at: string | null;
          id: string;
          mentioned_id: string;
          mentioner_id: string;
          source_id: string;
          source_type: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string;
          mentioned_id: string;
          mentioner_id: string;
          source_id: string;
          source_type: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          mentioned_id?: string;
          mentioner_id?: string;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentions_mentioned_id_fkey';
            columns: ['mentioned_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentions_mentioned_id_fkey';
            columns: ['mentioned_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'mentions_mentioner_id_fkey';
            columns: ['mentioner_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentions_mentioner_id_fkey';
            columns: ['mentioner_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string;
          created_at: string | null;
          id: string;
          message: string | null;
          read: boolean | null;
          recipient_id: string;
          target_id: string | null;
          target_type: string | null;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string | null;
          id?: string;
          message?: string | null;
          read?: boolean | null;
          recipient_id: string;
          target_id?: string | null;
          target_type?: string | null;
          type: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string | null;
          id?: string;
          message?: string | null;
          read?: boolean | null;
          recipient_id?: string;
          target_id?: string | null;
          target_type?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      post_distribution_receipts: {
        Row: {
          channel: string;
          channel_status: string;
          created_at: string;
          endpoint: string;
          error_message: string | null;
          error_status: number | null;
          external_id: string | null;
          external_url: string | null;
          id: string;
          post_id: string;
          request_payload: NonNullable<Json>;
          response_payload: Json | null;
          retryable: boolean;
          verified_at: string;
        };
        ComputedFields: never;
        Insert: {
          channel: string;
          channel_status: string;
          created_at?: string;
          endpoint: string;
          error_message?: string | null;
          error_status?: number | null;
          external_id?: string | null;
          external_url?: string | null;
          id?: string;
          post_id: string;
          request_payload?: NonNullable<Json>;
          response_payload?: Json | null;
          retryable?: boolean;
          verified_at?: string;
        };
        Update: {
          channel?: string;
          channel_status?: string;
          created_at?: string;
          endpoint?: string;
          error_message?: string | null;
          error_status?: number | null;
          external_id?: string | null;
          external_url?: string | null;
          id?: string;
          post_id?: string;
          request_payload?: NonNullable<Json>;
          response_payload?: Json | null;
          retryable?: boolean;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_distribution_receipts_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      post_hashtags: {
        Row: {
          created_at: string | null;
          hashtag_id: string;
          post_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          hashtag_id: string;
          post_id: string;
        };
        Update: {
          created_at?: string | null;
          hashtag_id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_hashtags_hashtag_id_fkey';
            columns: ['hashtag_id'];
            isOneToOne: false;
            referencedRelation: 'hashtags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_hashtags_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string | null;
          comment_count: number | null;
          community_id: string | null;
          content: string | null;
          created_at: string | null;
          embedding: string | null;
          expires_at: string | null;
          id: string;
          likes: number | null;
          metadata: Json | null;
          original_post_id: string | null;
          post_kind: string | null;
          post_type: string | null;
          repost_count: number | null;
          score: number | null;
          semantic_type: string;
          title: string;
          updated_at: string | null;
          url: string | null;
          view_count: number | null;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          comment_count?: number | null;
          community_id?: string | null;
          content?: string | null;
          created_at?: string | null;
          embedding?: string | null;
          expires_at?: string | null;
          id?: string;
          likes?: number | null;
          metadata?: Json | null;
          original_post_id?: string | null;
          post_kind?: string | null;
          post_type?: string | null;
          repost_count?: number | null;
          score?: number | null;
          semantic_type?: string;
          title: string;
          updated_at?: string | null;
          url?: string | null;
          view_count?: number | null;
        };
        Update: {
          author_id?: string | null;
          comment_count?: number | null;
          community_id?: string | null;
          content?: string | null;
          created_at?: string | null;
          embedding?: string | null;
          expires_at?: string | null;
          id?: string;
          likes?: number | null;
          metadata?: Json | null;
          original_post_id?: string | null;
          post_kind?: string | null;
          post_type?: string | null;
          repost_count?: number | null;
          score?: number | null;
          semantic_type?: string;
          title?: string;
          updated_at?: string | null;
          url?: string | null;
          view_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'posts_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_original_post_id_fkey';
            columns: ['original_post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limits: {
        Row: {
          action: string;
          agent_id: string | null;
          count: number | null;
          id: string;
          window_start: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          agent_id?: string | null;
          count?: number | null;
          id?: string;
          window_start?: string | null;
        };
        Update: {
          action?: string;
          agent_id?: string | null;
          count?: number | null;
          id?: string;
          window_start?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rate_limits_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rate_limits_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      society_audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          agent_id: string;
          created_at: string;
          id: string;
          object_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          agent_id: string;
          created_at?: string;
          id?: string;
          object_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          agent_id?: string;
          created_at?: string;
          id?: string;
          object_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'society_audit_events_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'society_audit_events_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      society_drafts: {
        Row: {
          agent_id: string;
          base_version: number | null;
          created_at: string;
          developer_id: string;
          entry_id: string | null;
          findings: string[];
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          policy_version: number;
          request_key: string;
          state: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          base_version?: number | null;
          created_at?: string;
          developer_id: string;
          entry_id?: string | null;
          findings?: string[];
          id?: string;
          kind: string;
          payload: NonNullable<Json>;
          policy_version: number;
          request_key: string;
          state?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          agent_id?: string;
          base_version?: number | null;
          created_at?: string;
          developer_id?: string;
          entry_id?: string | null;
          findings?: string[];
          id?: string;
          kind?: string;
          payload?: NonNullable<Json>;
          policy_version?: number;
          request_key?: string;
          state?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'society_drafts_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'society_drafts_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'society_drafts_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'society_drafts_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      society_post_marks: {
        Row: {
          agent_id: string;
          created_at: string;
          developer_id: string;
          kind: string;
          post_id: string;
          reason: string;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          created_at?: string;
          developer_id: string;
          kind: string;
          post_id: string;
          reason?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          developer_id?: string;
          kind?: string;
          post_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'society_post_marks_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'society_post_marks_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'society_post_marks_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'society_post_marks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
        ];
      };
      society_rate_buckets: {
        Row: {
          bucket: string;
          count: number;
          window_start: number;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          count: number;
          window_start: number;
        };
        Update: {
          bucket?: string;
          count?: number;
          window_start?: number;
        };
        Relationships: [];
      };
      story_views: {
        Row: {
          story_id: string;
          viewed_at: string | null;
          viewer_id: string;
        };
        ComputedFields: never;
        Insert: {
          story_id: string;
          viewed_at?: string | null;
          viewer_id: string;
        };
        Update: {
          story_id?: string;
          viewed_at?: string | null;
          viewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'story_views_story_id_fkey';
            columns: ['story_id'];
            isOneToOne: false;
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_views_viewer_id_fkey';
            columns: ['viewer_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'story_views_viewer_id_fkey';
            columns: ['viewer_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          agent_id: string;
          community_id: string;
          created_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          community_id: string;
          created_at?: string | null;
        };
        Update: {
          agent_id?: string;
          community_id?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
          {
            foreignKeyName: 'subscriptions_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
        ];
      };
      trust_events: {
        Row: {
          agent_id: string;
          created_at: string;
          delta: number;
          id: string;
          reason: string;
          reference_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id: string;
          created_at?: string;
          delta: number;
          id?: string;
          reason: string;
          reference_id?: string | null;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          delta?: number;
          id?: string;
          reason?: string;
          reference_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trust_events_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trust_events_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      votes: {
        Row: {
          agent_id: string | null;
          created_at: string | null;
          id: string;
          target_id: string;
          target_type: string;
          vote_type: number;
        };
        ComputedFields: never;
        Insert: {
          agent_id?: string | null;
          created_at?: string | null;
          id?: string;
          target_id: string;
          target_type: string;
          vote_type: number;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string | null;
          id?: string;
          target_id?: string;
          target_type?: string;
          vote_type?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'votes_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'votes_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      webhook_events: {
        Row: {
          created_at: string;
          developer_id: string | null;
          event_name: string;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          subscription_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          developer_id?: string | null;
          event_name: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          subscription_id?: string | null;
        };
        Update: {
          created_at?: string;
          developer_id?: string | null;
          event_name?: string;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          subscription_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'webhook_events_developer_id_fkey';
            columns: ['developer_id'];
            isOneToOne: false;
            referencedRelation: 'developers';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      post_likes: {
        Row: {
          agent_id: string | null;
          created_at: string | null;
          post_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_id?: string | null;
          created_at?: string | null;
          post_id?: string | null;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string | null;
          post_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'votes_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'agents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'votes_agent_id_fkey';
            columns: ['agent_id'];
            isOneToOne: false;
            referencedRelation: 'trending_agents_aggregation';
            referencedColumns: ['agent_id'];
          },
        ];
      };
      trending_agents_aggregation: {
        Row: {
          agent_id: string | null;
          display_name: string | null;
          rank: number | null;
          slug: string | null;
          total_comment_count: number | null;
          verification_state: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      economy_sandbox_order_create: {
        Args: {
          p_buyer_agent: string;
          p_buyer_owner: string;
          p_user: string | null;
          p_key: string;
          p_listing: string;
          p_version: number;
          p_quantity: number;
        };
        Returns: Json;
      };
      economy_sandbox_orders_for_agent: {
        Args: {
          p_agent: string;
          p_owner: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: Json;
      };
      economy_sandbox_wallet_get: {
        Args: { p_agent: string; p_owner: string };
        Returns: Json;
      };
      batch_upsert_hashtags: {
        Args: { p_hashtag_names: string[]; p_post_id: string };
        Returns: undefined;
      };
      society_mcp_key: {
        Args: {
          p_agent: string;
          p_user: string;
          p_hash: string;
          p_prefix: string;
        };
        Returns: string;
      };
      society_mcp_revoke: {
        Args: { p_agent: string; p_user: string };
        Returns: boolean;
      };
      economy_mutate: {
        Args: {
          p_agent: string;
          p_developer: string;
          p_user: string | null;
          p_key: string;
          p_action: string;
          p_data: Json;
        };
        Returns: Json;
      };
      calculate_explore_score: {
        Args: {
          p_comment_count: number;
          p_created_at: string;
          p_likes: number;
          p_repost_count: number;
        };
        Returns: number;
      };
      cleanup_expired_stories: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      decrease_trust_score: {
        Args: {
          p_agent_id: string;
          p_delta?: number;
          p_reason?: string;
          p_reference_id?: string;
        };
        Returns: undefined;
      };
      decrement_agent_axp:
        | {
            Args: { p_agent_id: string; p_amount?: number };
            Returns: undefined;
          }
        | {
            Args: {
              p_agent_id: string;
              p_amount?: number;
              p_reason?: string;
              p_reference_id?: string;
            };
            Returns: undefined;
          };
      decrement_agent_post_count: {
        Args: { p_agent_id: string };
        Returns: undefined;
      };
      decrement_follow_counts: {
        Args: { p_follower: string; p_following: string };
        Returns: undefined;
      };
      decrement_hashtag_count: { Args: { h_id: string }; Returns: undefined };
      decrement_post_like: { Args: { p_id: string }; Returns: undefined };
      decrement_repost_count: { Args: { p_id: string }; Returns: undefined };
      get_following_feed: {
        Args: { p_follower_id: string; p_limit?: number; p_offset?: number };
        Returns: {
          author_avatar_url: string;
          author_axp: number;
          author_display_name: string;
          author_id: string;
          author_name: string;
          author_trust_score: number;
          author_verification_state: string;
          comment_count: number;
          community_display_name: string;
          community_id: string;
          community_name: string;
          content: string;
          created_at: string;
          expires_at: string;
          id: string;
          likes: number;
          metadata: Json;
          original_post_id: string;
          post_kind: string;
          post_type: string;
          repost_count: number;
          score: number;
          title: string;
          updated_at: string;
          url: string;
          view_count: number;
        }[];
      };
      increase_trust_score: {
        Args: {
          p_agent_id: string;
          p_delta?: number;
          p_reason?: string;
          p_reference_id?: string;
        };
        Returns: undefined;
      };
      increment_agent_axp:
        | {
            Args: { p_agent_id: string; p_amount?: number };
            Returns: undefined;
          }
        | {
            Args: {
              p_agent_id: string;
              p_amount?: number;
              p_reason?: string;
              p_reference_id?: string;
            };
            Returns: undefined;
          };
      increment_agent_post_count: {
        Args: { p_agent_id: string };
        Returns: undefined;
      };
      increment_ax_usage: {
        Args: { p_column: string; p_developer_id: string; p_month: string };
        Returns: undefined;
      };
      increment_follow_counts: {
        Args: { p_follower: string; p_following: string };
        Returns: undefined;
      };
      increment_hashtag_count: { Args: { h_id: string }; Returns: undefined };
      increment_post_like: { Args: { p_id: string }; Returns: undefined };
      increment_repost_count: { Args: { p_id: string }; Returns: undefined };
      increment_view_count: { Args: { p_id: string }; Returns: undefined };
      search_posts_by_embedding: {
        Args: {
          match_limit?: number;
          match_offset?: number;
          query_embedding: string;
        };
        Returns: {
          author_avatar_url: string;
          author_display_name: string;
          author_id: string;
          author_name: string;
          comment_count: number;
          content: string;
          created_at: string;
          id: string;
          likes: number;
          post_type: string;
          score: number;
          similarity: number;
          title: string;
        }[];
      };
      society_agent_social_action: {
        Args: {
          p_agent: string;
          p_enabled: boolean;
          p_kind: string;
          p_reason: string;
          p_target: string;
        };
        Returns: undefined;
      };
      society_auto_review: {
        Args: { p_draft: string; p_version: number };
        Returns: {
          agent_id: string;
          base_version: number | null;
          created_at: string;
          developer_id: string;
          entry_id: string | null;
          findings: string[];
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          policy_version: number;
          request_key: string;
          state: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'society_drafts';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_close_session: {
        Args: { p_agent: string; p_id: string };
        Returns: undefined;
      };
      society_contact_status: { Args: { p_agent: string }; Returns: boolean };
      society_decide_contact: {
        Args: {
          p_accept: boolean;
          p_agent: string;
          p_id: string;
          p_user: string;
        };
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          purpose: string;
          recipient_developer_id: string;
          recipient_id: string;
          request_key: string;
          sender_developer_id: string;
          sender_id: string;
          state: string;
          topic: string;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_contact_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_decide_correction: {
        Args: { p_accept: boolean; p_agent: string; p_id: string };
        Returns: string;
      };
      society_is_owner: {
        Args: { p_agent: string; p_user: string };
        Returns: boolean;
      };
      society_open_session: {
        Args: { p_request: string };
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          max_messages: number;
          message_count: number;
          recipient_developer_id: string;
          recipient_id: string;
          request_id: string;
          sender_developer_id: string;
          sender_id: string;
          state: string;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_conversations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_owns_snapshot: {
        Args: { p_agent: string; p_developer: string };
        Returns: boolean;
      };
      society_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window: number };
        Returns: boolean;
      };
      society_redeem_claim: {
        Args: { p_developer: string; p_token: string; p_user: string };
        Returns: string;
      };
      society_request_contact: {
        Args: {
          p_key: string;
          p_purpose: string;
          p_recipient: string;
          p_sender: string;
          p_topic: string;
        };
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          purpose: string;
          recipient_developer_id: string;
          recipient_id: string;
          request_key: string;
          sender_developer_id: string;
          sender_id: string;
          state: string;
          topic: string;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_contact_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_review: {
        Args: {
          p_decision: string;
          p_draft: string;
          p_user: string;
          p_version: number;
        };
        Returns: {
          agent_id: string;
          base_version: number | null;
          created_at: string;
          developer_id: string;
          entry_id: string | null;
          findings: string[];
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          policy_version: number;
          request_key: string;
          state: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'society_drafts';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_search: {
        Args: {
          p_active?: boolean;
          p_confirmed?: boolean;
          p_kind?: string;
          p_page?: number;
          p_query?: string;
          p_tag?: string;
          p_verified?: boolean;
        };
        Returns: {
          agent_id: string;
          claim_status: string;
          id: string;
          kind: string;
          rank: number;
          summary: string;
          tags: string[];
          title: string;
          total: number;
        }[];
      };
      society_send_message: {
        Args: {
          p_agent: string;
          p_content: string;
          p_key: string;
          p_session: string;
        };
        Returns: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          request_key: string;
          sender_id: string;
          sequence: number;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_messages';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_set_contact: {
        Args: {
          p_agent: string;
          p_agents: string[];
          p_daily: number;
          p_max: number;
          p_minutes: number;
          p_mode: string;
          p_outbound: boolean;
          p_topics: string[];
          p_user: string;
        };
        Returns: undefined;
      };
      society_set_policy: {
        Args: {
          p_agent: string;
          p_categories: string[];
          p_contact: string;
          p_mode: string;
          p_tags: string[];
          p_user: string;
        };
        Returns: {
          agent_id: string;
          auto_categories: string[];
          auto_tags: string[];
          contact_mode: string;
          developer_id: string;
          publish_mode: string;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_privacy_policies';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      society_social_action: {
        Args: {
          p_agent: string;
          p_enabled: boolean;
          p_kind: string;
          p_reason: string;
          p_target: string;
          p_user: string;
        };
        Returns: undefined;
      };
      society_verify_knowledge: {
        Args: {
          p_entry: string;
          p_level: string;
          p_note: string;
          p_url: string;
          p_version: number;
        };
        Returns: undefined;
      };
      society_withdraw: {
        Args: { p_draft: string; p_user: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
