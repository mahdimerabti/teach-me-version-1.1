import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://azlvrrioyvqdlacjlbhs.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bHZycmlveXZxZGxhY2psYmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjc3MTQsImV4cCI6MjEwNTk0MzcxNH0.VMUmU2-kBfAuMLbGnag0XLr2gbuiRqA7QWgpNXcDkRg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const authLog = (message: string, ...details: any[]) => {
  console.log(`[Auth Flow] ${message}`, details.length ? details : '');
};

export type Database = {
  public: {
    Tables: {
      tutors: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          name_ar: string;
          bio: string;
          bio_ar: string;
          subjects: string[];
          hourly_rate: number;
          rating: number;
          review_count: number;
          experience_years: number;
          languages: string[];
          avatar_url: string | null;
          video_url: string | null;
          is_online: boolean;
          response_time: string;
          is_verified: boolean;
          status: 'pending' | 'approved' | 'rejected' | 'info_requested' | 'suspended' | 'banned';
          email: string | null;
          phone: string | null;
          id_document_url: string | null;
          certificates: string[] | null;
          identity_verified: boolean;
          meeting_settings: Record<string, any> | null;
          category: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tutors']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['tutors']['Insert']>;
      };
      schedules: {
        Row: {
          id: string;
          tutor_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_available: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['schedules']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['schedules']['Insert']>;
      };
      bookings: {
        Row: {
          id: string;
          student_id: string;
          tutor_id: string;
          schedule_id: string | null;
          date: string;
          start_time: string;
          duration_minutes: number;
          status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
          total_price: number;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
      };
      questions: {
        Row: {
          id: string;
          student_id: string;
          tutor_id: string;
          subject: string;
          question: string;
          answer: string | null;
          is_answered: boolean;
          created_at: string;
          answered_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['questions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['questions']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          role: 'student' | 'tutor' | 'admin';
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      sessions: {
        Row: {
          id: string;
          booking_group_id: string;
          student_id: string;
          tutor_id: string;
          date: string;
          start_time: string;
          end_time: string;
          status: 'confirmed' | 'live' | 'cancelled' | 'completed' | 'missed';
          credit_cost: number;
          live_room_id: string;
          subject: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sessions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>;
      };
      packages: {
        Row: {
          id: string;
          code: string;
          name: string;
          name_ar: string;
          price_cents: number;
          credits: number;
          bonus_credits: number;
          gift_description: string | null;
          gift_description_ar: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['packages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['packages']['Insert']>;
      };
      credit_transactions: {
        Row: {
          id: string;
          student_id: string;
          amount: number;
          type: 'purchase' | 'bonus' | 'spend' | 'refund' | 'referral' | 'expiry';
          package_id: string | null;
          session_id: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['credit_transactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['credit_transactions']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          title: string;
          title_ar: string | null;
          body: string;
          body_ar: string | null;
          kind: 'reminder' | 'booking' | 'credit';
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      rooms: {
        Row: {
          id: string;
          session_id: string | null;
          host_user_id: string | null;
          student_user_id: string | null;
          title: string;
          status: 'waiting' | 'live' | 'ended';
          active_mode: 'video' | 'whiteboard' | 'screenshare';
          whiteboard_state: Record<string, any>;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['rooms']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['rooms']['Row']>;
      };
      room_participants: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          role: 'host' | 'student';
          is_muted: boolean;
          is_camera_off: boolean;
          is_hand_raised: boolean;
          is_sharing_screen: boolean;
          is_online: boolean;
          joined_at: string;
          left_at: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['room_participants']['Row'], 'id' | 'joined_at' | 'updated_at'> & {
          id?: string;
          joined_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['room_participants']['Row']>;
      };
      room_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          sender_name: string;
          sender_role: 'host' | 'student';
          content: string;
          kind: 'text' | 'system' | 'reaction' | 'file';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['room_messages']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['room_messages']['Row']>;
      };
    };
  };
};
