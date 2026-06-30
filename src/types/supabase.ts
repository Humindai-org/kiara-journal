export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TradeDirection = "LONG" | "SHORT";
export type TradeSession = "TOKYO" | "LONDON" | "NEW_YORK" | "OVERLAP";
export type TradeSource = "MT5" | "MANUAL";
export type AccountType = "MT5" | "BITGET" | "BYBIT" | "BINANCE" | "MANUAL";
export type NewsImpact = "HIGH" | "MEDIUM" | "LOW";
export type NotebookCategory =
  | "PLANNED_TEMPLATE"
  | "MY_TEMPLATE"
  | "PLAYBOOK"
  | "MINDSET"
  | "PRODUCTIVITY";
export type ViolationType =
  | "MAX_TRADES"
  | "OUTSIDE_WINDOW"
  | "DAILY_LOSS"
  | "AFTER_PROFIT_TARGET"
  | "HIGH_IMPACT_NEWS";

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: AccountType;
          broker: string;
          account_number: string | null;
          currency: string;
          initial_balance: number;
          current_balance: number;
          is_active: boolean;
          mt5_server: string | null;
          webhook_token: string;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["accounts"]["Row"], "id" | "created_at" | "webhook_token">;
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
      };
      trades: {
        Row: {
          id: string;
          account_id: string;
          user_id: string;
          instrument: string;
          direction: TradeDirection;
          lot_size: number;
          entry_price: number;
          exit_price: number | null;
          sl: number | null;
          tp: number | null;
          open_time: string;
          close_time: string | null;
          duration_minutes: number | null;
          session: TradeSession | null;
          gross_pnl: number | null;
          net_pnl: number | null;
          fees: number | null;
          swap: number | null;
          risk_r: number | null;
          return_r: number | null;
          risk_percent: number | null;
          plan_id: string | null;
          entry_emotion: string | null;
          exit_emotion: string | null;
          mistakes: string[] | null;
          notes: string | null;
          followed_plan: boolean | null;
          source: TradeSource;
          mt5_ticket: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["trades"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["trades"]["Insert"]>;
      };
      plans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          plan_type: string;
          is_active: boolean;
          charting_process: Json | null;
          entry_criteria: Json | null;
          entry_models: Json | null;
          trade_management_rules: string | null;
          exit_criteria: string | null;
          max_trades_per_day: number | null;
          max_daily_loss: number | null;
          max_daily_profit: number | null;
          risk_per_trade_percent: number | null;
          trading_notes: string | null;
          last_reviewed_at: string | null;
          created_at: string;
          updated_at: string | null;
          trading_window_start: string | null;
          trading_window_end: string | null;
          min_confluences: number | null;
          max_consecutive_losses: number | null;
          notes_items: Json | null;
        };
        Insert: Omit<Database["public"]["Tables"]["plans"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
      };
      journal_entries: {
        Row: {
          id: string;
          trade_id: string;
          user_id: string;
          hft_chart_url: string | null;
          mft_chart_url: string | null;
          lft_chart_url: string | null;
          review_plan: string | null;
          entry_confluences: Json | null;
          trade_management_notes: string | null;
          entry_emotion: string | null;
          exit_emotion: string | null;
          voice_note_url: string | null;
          ai_analysis: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["journal_entries"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["journal_entries"]["Insert"]>;
      };
      discipline_violations: {
        Row: {
          id: string;
          trade_id: string | null;
          user_id: string;
          account_id: string;
          violation_type: ViolationType;
          date: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["discipline_violations"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["discipline_violations"]["Insert"]>;
      };
      notebooks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category: NotebookCategory;
          content: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notebooks"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["notebooks"]["Insert"]>;
      };
      news_blocks: {
        Row: {
          id: string;
          event_name: string;
          currency: string;
          impact: NewsImpact;
          event_time: string;
          block_minutes_before: number;
          block_minutes_after: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["news_blocks"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["news_blocks"]["Insert"]>;
      };
    };
  };
}
