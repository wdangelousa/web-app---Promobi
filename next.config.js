/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.resolve.alias.canvas = false;
        return config;
    },
    // Silence Turbopack error by providing an empty config (since we are mainly using webpack for this specific rule)

};

export default nextConfig;
