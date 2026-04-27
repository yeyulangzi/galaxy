/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'openai', '@anthropic-ai/sdk'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
        'openai': 'commonjs openai',
        '@anthropic-ai/sdk': 'commonjs @anthropic-ai/sdk',
      })
    }
    return config
  },
}

export default nextConfig
