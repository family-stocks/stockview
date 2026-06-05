import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('latest_agent_reports').select('*').limit(1);
  if (error) {
    console.error("Error fetching:", error);
  } else {
    console.log("Schema from view:", JSON.stringify(data, null, 2));
  }
}
run();
