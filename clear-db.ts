import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('Missing VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

async function clearDatabase() {

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get current user (need to be authenticated)
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.log('Not authenticated. Deleting all entries...');
    // Delete all entries (RLS should limit to user's data anyway)
    const { error } = await supabase
      .from('food_entries')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Cleared food_entries table');
    }
  } else {
    console.log('Deleting entries for user:', user.id);
    const { error } = await supabase
      .from('food_entries')
      .delete()
      .eq('user_id', user.id);
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Cleared food_entries for user');
    }
  }
}

clearDatabase();
