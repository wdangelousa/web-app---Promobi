const { Client } = require('pg');
require('dotenv').config();

async function testConnection(host, port, user) {
    const password = process.env.DATABASE_URL.match(/:([^:@]+)@/)[1];
    const urlStr = `postgresql://${user}:${password}@${host}:${port}/postgres`;
    console.log('Testing: ', urlStr.replace(/:[^:]+@/, ':***@'));
    
    const client = new Client({ connectionString: urlStr });
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log('Success! Connected at:', res.rows[0].now);
    } catch (err) {
        console.error('Connection error:', err.message);
    } finally {
        await client.end();
    }
}

async function main() {
    console.log('--- IPv4 SESSION POOLER (port 5432) ---');
    await testConnection('aws-0-us-east-1.pooler.supabase.com', 5432, 'postgres.uykhuohfrhihujjpxyay');
    
    console.log('--- IPv4 TRANSACTION POOLER (port 6543) ---');
    await testConnection('aws-0-us-east-1.pooler.supabase.com', 6543, 'postgres.uykhuohfrhihujjpxyay');
}

main();
