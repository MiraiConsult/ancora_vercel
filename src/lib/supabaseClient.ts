
import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://ajdqvacuudavitiehopy.supabase.co';
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZHF2YWN1dWRhdml0aWVob3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MDY3MzksImV4cCI6MjA4MTM4MjczOX0.2-b4uwcFwiiUCRYhuAl3wXCGZDcdgses2B14W_fMhvE';

// Cria uma instância única e estável do client Supabase.
// A biblioteca Supabase JS gerencia automaticamente a persistência da sessão e a atualização de tokens.
// Definimos explicitamente as opções `persistSession` e `autoRefreshToken` para clareza,
// garantindo que a sessão do usuário esteja sempre disponível para as políticas RLS.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});