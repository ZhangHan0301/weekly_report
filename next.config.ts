import type { NextConfig } from 'next';

const [repositoryOwner = '', repository = ''] =
  process.env.GITHUB_REPOSITORY?.split('/') || [];
const assetPrefix =
  process.env.GITHUB_PAGES === 'true' &&
  repositoryOwner &&
  repository &&
  !repository.endsWith('.github.io')
    ? `https://${repositoryOwner}.github.io/${repository}`
    : '';

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix,
  trailingSlash: true,
};

export default nextConfig;
