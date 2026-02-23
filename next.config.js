/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {},
    webpack: (config) => {
        // ✅ FIX 1: Disable canvas (required for pdfjs-dist in Node/SSR)
        config.resolve.alias.canvas = false;

        // ✅ FIX 2: Tell webpack to handle .mjs files from pdfjs-dist correctly
        config.module.rules.push({
            test: /\.mjs$/,
            include: /node_modules/,
            type: 'javascript/auto',
        });

        return config;
    },
    serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'canvas'],
};

export default nextConfig;
