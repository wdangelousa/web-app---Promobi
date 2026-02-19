/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {},
    webpack: (config) => {
        config.resolve.alias.canvas = false;
        return config;
    },
    serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'canvas'],
};
export default nextConfig;
