import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Listing bucket 'documents' root...");
    const { data: dataRoot, error: errRoot } = await supabase.storage.from('documents').list('', { limit: 100 });
    console.log('root/:', dataRoot?.map(f => f.name), errRoot);

    const { data: data47, error: err47 } = await supabase.storage.from('documents').list('47/', { limit: 100 });
    console.log('47/:', data47?.map(f => f.name), err47);
}

main().catch(console.error);
