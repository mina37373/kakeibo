import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://webyskbzzlsxujpwvxgd.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlYnlza2J6emxzeHVqcHd2eGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjE5NDMsImV4cCI6MjA5ODM5Nzk0M30.v7QxEA6bv3_rQd1mMGz90ivOhURbgWJLYk5RLYvgdfI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
})
