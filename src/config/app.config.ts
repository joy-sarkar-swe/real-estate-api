import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  name: process.env.APP_NAME || 'RealEstateAPI',
  version: process.env.APP_VERSION || '1.0.0',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH || 'docs',
    title: process.env.SWAGGER_TITLE || 'Real Estate API',
    description: process.env.SWAGGER_DESCRIPTION || '',
    version: process.env.SWAGGER_VERSION || '1.0.0',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    loginTtl: parseInt(process.env.THROTTLE_LOGIN_TTL || '60', 10),
    loginLimit: parseInt(process.env.THROTTLE_LOGIN_LIMIT || '5', 10),
  },

  cache: {
    propertyDetailTtl: parseInt(process.env.CACHE_PROPERTY_DETAIL_TTL || '300', 10),
    searchTtl: parseInt(process.env.CACHE_SEARCH_TTL || '60', 10),
    userTtl: parseInt(process.env.CACHE_USER_TTL || '300', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    dir: process.env.LOG_DIR || './logs',
  },
}));
