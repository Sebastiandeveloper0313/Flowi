export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
      chat_messages: {
        Row: {
          chat_id: string;
          content: string;
          created_agents: Json;
          created_at: string;
          id: string;
          role: string;
          team_id: string;
        };
        Insert: {
          chat_id: string;
          content: string;
          created_agents?: Json;
          created_at?: string;
          id?: string;
          role: string;
          team_id: string;
        };
        Update: {
          chat_id?: string;
          content?: string;
          created_agents?: Json;
          created_at?: string;
          id?: string;
          role?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      chats: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          team_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          team_id: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          team_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chats_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      connections: {
        Row: {
          config: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          label: string | null;
          provider: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          provider: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          provider?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connections_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_runs: {
        Row: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          output: string | null;
          output_url: string | null;
          started_at: string | null;
          status: string;
          summary: string | null;
          task_id: string;
          team_id: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          output?: string | null;
          output_url?: string | null;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          task_id: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          output?: string | null;
          output_url?: string | null;
          started_at?: string | null;
          status?: string;
          summary?: string | null;
          task_id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_runs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_runs_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          channel: string;
          created_at: string;
          created_by: string;
          id: string;
          instructions: string;
          last_run_at: string | null;
          next_run_at: string | null;
          schedule_cron: string | null;
          status: string;
          team_id: string;
          timezone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          instructions: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          schedule_cron?: string | null;
          status?: string;
          team_id: string;
          timezone?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          instructions?: string;
          last_run_at?: string | null;
          next_run_at?: string | null;
          schedule_cron?: string | null;
          status?: string;
          team_id?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          created_at: string;
          role: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          business_categories: string[];
          business_context: Json | null;
          business_description: string | null;
          business_model: string | null;
          created_at: string;
          created_by: string;
          id: string;
          logo_url: string | null;
          monthly_revenue: string | null;
          name: string;
          onboarding_completed: boolean;
          onboarding_step: number;
          owner_role: string | null;
          team_size: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          business_categories?: string[];
          business_context?: Json | null;
          business_description?: string | null;
          business_model?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          logo_url?: string | null;
          monthly_revenue?: string | null;
          name: string;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          owner_role?: string | null;
          team_size?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          business_categories?: string[];
          business_context?: Json | null;
          business_description?: string | null;
          business_model?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          logo_url?: string | null;
          monthly_revenue?: string | null;
          name?: string;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          owner_role?: string | null;
          team_size?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      flowy_dispatch_due_tasks: { Args: never; Returns: undefined };
      is_team_admin: { Args: { p_team_id: string }; Returns: boolean };
      is_team_member: { Args: { p_team_id: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
